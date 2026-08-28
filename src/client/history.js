import { api } from './api.js';
import { initializeAuthentication } from './auth.js';
import { DATA_CHANGE_EVENT, deleteSession, getClipBlob, getSession, listClips, listPendingClips, listSessions, recoverInterruptedClips, setActiveOwner, storageEstimate, updateClip } from './db.js';
import { createAudioZip } from './audio-export.js';
import { analysisAsText, analysisFilename, renderAnalysis } from './analysis-report.mjs';

const $ = (selector) => document.querySelector(selector);
let deleteId = null;
let historyReady = false;
let historyRefreshTimer = null;
const processing = new Set();
const audioObjectUrls = new Set();

function finishLoading() {
  $('#historyLoading')?.classList.add('hidden');
  $('#historyLoading')?.removeAttribute('aria-busy');
  $('#historyList')?.classList.remove('hidden');
}

function scheduleHistoryRefresh(delay = 250) {
  if (!historyReady) return;
  clearTimeout(historyRefreshTimer);
  historyRefreshTimer = setTimeout(() => render().catch((error) => { $('#historyStatus').textContent = error.message; }), delay);
}

function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add('hidden'), 2500); }
function download(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function processClip(clipId) {
  if (processing.has(clipId)) return;
  processing.add(clipId);
  try {
    const clip = (await listPendingClips()).find((item) => item.id === clipId);
    if (!clip) return;
    const session = await getSession(clip.sessionId);
    const blob = await getClipBlob(clip);
    await updateClip(clip.id, { status: 'uploading', attempts: (clip.attempts || 0) + 1, error: '' });
    const form = new FormData(); form.append('audio', blob, `${clip.id}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`); form.append('clipId', clip.id);
    const question = session?.questions?.find((item) => item.id === clip.questionId);
    form.append('hints', [...(session?.students || []), question?.text || ''].join(', '));
    const result = await api('/api/transcribe', { method: 'POST', body: form });
    await updateClip(clip.id, { status: 'complete', transcript: result.text, transcribedAt: new Date().toISOString(), error: '' });
  } catch (error) { await updateClip(clipId, { status: 'failed', error: error.message }).catch(() => {}); }
  finally { processing.delete(clipId); }
}

async function retryAll() {
  const pending = await listPendingClips();
  if (!pending.length) return toast('No pending audio clips.');
  $('#historyStatus').textContent = `Retrying ${pending.length} locally backed-up clip${pending.length === 1 ? '' : 's'}…`;
  for (const clip of pending) await processClip(clip.id);
  await render();
}

function button(label, className, action) {
  const node = document.createElement('button'); node.type = 'button'; node.className = `button ${className}`; node.textContent = label; node.addEventListener('click', action); return node;
}

async function exportSession(session) {
  const clips = await listClips(session.id);
  const data = { format: 'pw-grq-backup/v2', exportedAt: new Date().toISOString(), session, clips: clips.map(({ id, questionId, speaker, status, transcript, error, createdAt, mimeType }) => ({ id, questionId, speaker, status, transcript, error, createdAt, mimeType })) };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `pw-grq-${session.id}.json`);
}

function exportAnalysis(session, analysis) {
  download(
    new Blob([analysisAsText(analysis, session.title || 'PW GRQ session')], { type: 'text/plain;charset=utf-8' }),
    analysisFilename(analysis)
  );
  toast('Downloaded the selected analysis.');
}

async function exportAudio(session, button) {
  const clips = await listClips(session.id);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  toast('Preparing one audio ZIP…');
  try {
    const archive = await createAudioZip(session, clips, getClipBlob);
    download(archive.blob, archive.filename);
    toast(`Downloaded one ZIP containing ${archive.entryCount} audio clip${archive.entryCount === 1 ? '' : 's'}.`);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

async function loadPlayers(details, clipsById) {
  for (const player of details.querySelectorAll('audio[data-clip-id]')) {
    if (player.src) continue;
    const clip = clipsById.get(player.dataset.clipId);
    if (!clip) continue;
    player.setAttribute('aria-busy', 'true');
    try {
      const url = URL.createObjectURL(await getClipBlob(clip));
      audioObjectUrls.add(url);
      player.src = url;
    } catch (error) {
      const status = player.nextElementSibling;
      if (status) status.textContent = `Audio unavailable: ${error.message}`;
    } finally { player.removeAttribute('aria-busy'); }
  }
}

function releaseAudioUrls() {
  audioObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  audioObjectUrls.clear();
}

async function makeCard(session) {
  const clips = (await listClips(session.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const card = document.createElement('article'); card.className = 'history-card';
  const header = document.createElement('div'); header.className = 'history-card-header';
  const titleWrap = document.createElement('div'); const title = document.createElement('h2'); title.textContent = session.title || session.questions?.[0]?.text || 'Untitled session';
  const date = document.createElement('p'); date.className = 'muted'; date.textContent = new Date(session.createdAt).toLocaleString(); titleWrap.append(title, date);
  const pending = clips.filter((clip) => clip.status !== 'complete').length;
  const pendingLabel = `${pending} clip${pending === 1 ? '' : 's'} pending`;
  const badge = document.createElement('span'); badge.className = 'privacy-badge'; badge.textContent = pending ? pendingLabel : 'Fully transcribed';
  header.append(titleWrap, badge);
  const meta = document.createElement('div'); meta.className = 'history-meta';
  [`${session.questions?.length || 0} questions`, `${session.students?.length || 0} students`, `${clips.length} audio clips`, `${session.analyses?.length || 0} analyses`].forEach((text) => { const span = document.createElement('span'); span.textContent = text; meta.append(span); });
  const details = document.createElement('details'); details.className = 'history-details'; const summary = document.createElement('summary'); summary.textContent = 'View transcript'; details.append(summary);
  (session.questions || []).forEach((question, index) => {
    const section = document.createElement('section'); section.className = 'review-question'; const heading = document.createElement('h3'); heading.textContent = `Question ${index + 1}: ${question.text}`; section.append(heading);
    const rows = clips.filter((clip) => clip.questionId === question.id);
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No clips.'; section.append(empty); }
    rows.forEach((clip, clipIndex) => {
      const clipBlock = document.createElement('div'); clipBlock.className = 'clip-playback';
      const line = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = `${clip.speaker}: `;
      const clipText = clip.status === 'complete' ? (clip.transcript || 'No speech detected') : `[${clip.status}: ${clip.error || 'retry needed'}]`;
      line.append(strong, document.createTextNode(clipText));
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.dataset.clipId = clip.id;
      player.setAttribute('aria-label', `Replay ${clip.speaker} audio clip ${clipIndex + 1} for question ${index + 1}`);
      const playerStatus = document.createElement('small'); playerStatus.className = 'muted'; playerStatus.textContent = 'Saved on this device';
      clipBlock.append(line, player, playerStatus);
      section.append(clipBlock);
    });
    details.append(section);
  });
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  details.addEventListener('toggle', () => { if (details.open) loadPlayers(details, clipsById); });
  const analyses = Array.isArray(session.analyses) ? session.analyses : [];
  let analysisDetails = null;
  if (analyses.length) {
    analysisDetails = document.createElement('details'); analysisDetails.className = 'history-details history-analysis-details';
    const analysisSummary = document.createElement('summary'); analysisSummary.textContent = `View saved analyses (${analyses.length})`; analysisDetails.append(analysisSummary);
    analyses.slice().reverse().forEach((analysis) => {
      const saved = document.createElement('div'); saved.className = 'saved-analysis';
      saved.append(renderAnalysis(analysis));
      const analysisActions = document.createElement('div'); analysisActions.className = 'action-wrap analysis-actions';
      analysisActions.append(button('Download this analysis (.txt)', 'secondary', () => exportAnalysis(session, analysis)));
      saved.append(analysisActions); analysisDetails.append(saved);
    });
  }
  const actions = document.createElement('div'); actions.className = 'action-wrap';
  actions.append(button('Download backup', 'secondary', () => exportSession(session)), button('Download audio (.zip)', 'secondary', (event) => exportAudio(session, event.currentTarget)));
  if (pending) {
    actions.append(button('Retry transcription', 'secondary', async () => {
      for (const clip of clips.filter((item) => item.status !== 'complete')) {
        await processClip(clip.id);
      }
      await render();
    }));
  }
  actions.append(button('Delete', 'ghost-danger', () => { deleteId = session.id; $('#deleteDialog').showModal(); }));
  card.append(header, meta, details);
  if (analysisDetails) card.append(analysisDetails);
  card.append(actions); return card;
}

async function render() {
  releaseAudioUrls();
  const sessions = await listSessions(); const list = $('#historyList'); list.replaceChildren();
  const pending = await listPendingClips();
  $('#historyStatus').textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'} saved locally · ${pending.length} pending clip${pending.length === 1 ? '' : 's'}`;
  const estimate = await storageEstimate();
  $('#historyStorage').textContent = estimate ? `Device storage: ${formatBytes(estimate.usage)} used · ${formatBytes(estimate.quota)} available` : 'Device storage estimate unavailable';
  if (!sessions.length) {
    const empty = document.createElement('div'); empty.className = 'panel empty-state'; empty.textContent = 'No sessions have been recorded on this device.'; list.append(empty); finishLoading(); return;
  }
  for (const session of sessions) list.append(await makeCard(session));
  finishLoading();
}

$('#retryAllButton').addEventListener('click', retryAll);
$('#confirmDeleteButton').addEventListener('click', async (event) => {
  event.preventDefault();
  if (deleteId) await deleteSession(deleteId);
  deleteId = null;
  $('#deleteDialog').close();
  toast('Session deleted from this browser.');
  await render();
});

(async () => {
  try {
    const auth = await initializeAuthentication();
    if (auth.required && !auth.user) { location.assign('/'); return; }
    setActiveOwner(auth.user.uid);
    await recoverInterruptedClips();
    historyReady = true;
    await render();
  } catch (error) { $('#historyStatus').textContent = error.message; finishLoading(); }
})();

window.addEventListener('beforeunload', releaseAudioUrls);
window.addEventListener(DATA_CHANGE_EVENT, () => scheduleHistoryRefresh());
window.addEventListener('focus', () => scheduleHistoryRefresh(0));
window.addEventListener('pageshow', () => scheduleHistoryRefresh(0));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleHistoryRefresh(0);
});
