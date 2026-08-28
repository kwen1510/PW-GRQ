import { api } from './api.js';
import { initializeAuthentication, requestPasswordReset, signInTeacher, signOutTeacher } from './auth.js';
import {
  DATA_CHANGE_EVENT,
  getClip,
  getClipBlob,
  getSession,
  listClips,
  listPendingClips,
  migrateLegacyHistory,
  putSession,
  recoverInterruptedClips,
  requestPersistentStorage,
  setActiveOwner,
  storageEstimate,
  updateClip
} from './db.js';
import { DurableRecorder } from './recorder.js';
import { createAudioZip } from './audio-export.js';
import { analysisAsText, analysisFilename, renderAnalysis } from './analysis-report.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { session: null, questionIndex: 0, speaker: 'Teacher', prompts: [], activePromptId: null, defaultPromptId: null, promptAdmin: false, processing: new Map(), startedAt: 0, timer: null };
let statusRefreshTimer = null;
let statusRefreshRunning = false;
let statusRefreshQueued = false;
let serviceRefreshedAt = 0;
let statusAutoRefreshStarted = false;

function show(element, visible = true) { element?.classList.toggle('hidden', !visible); }
function message(element, text, kind = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `inline-message ${kind}`.trim();
  show(element, Boolean(text));
}
function toast(text) {
  const node = $('#toast');
  node.textContent = text;
  show(node, true);
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => show(node, false), 2800);
}
function formatBytes(bytes = 0) { return bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`; }
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ensurePasswordForm() {
  if ($('#signInForm')) return;
  const gate = $('#authGate');
  const heading = $('#authTitle');
  const oldButton = $('#signInButton');
  const oldError = $('#authError');
  if (!(gate && heading && oldButton)) return;

  heading.textContent = 'Sign in to PW Interview Recorder';
  const intro = heading.nextElementSibling;
  if (intro) intro.textContent = 'Use an administrator-approved teacher or admin account. New users should use First login or forgot password to set their password.';

  const form = document.createElement('form');
  form.id = 'signInForm';
  form.className = 'auth-form';
  const fields = [
    { id: 'signInEmail', label: 'Username (RI email)', type: 'email', autocomplete: 'username' },
    { id: 'signInPassword', label: 'Password', type: 'password', autocomplete: 'current-password' }
  ];
  fields.forEach(({ id, label, type, autocomplete }) => {
    const group = document.createElement('div');
    group.className = 'field-group';
    const fieldLabel = document.createElement('label');
    fieldLabel.htmlFor = id;
    fieldLabel.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.name = type === 'email' ? 'email' : 'password';
    input.type = type;
    input.autocomplete = autocomplete;
    input.required = true;
    if (type === 'email') {
      input.autocapitalize = 'none';
      input.spellcheck = false;
      input.inputMode = 'email';
    }
    group.append(fieldLabel, input);
    form.append(group);
  });
  const submit = document.createElement('button');
  submit.id = 'signInButton';
  submit.type = 'submit';
  submit.className = 'button primary wide';
  submit.textContent = 'Sign in';
  const help = document.createElement('p');
  help.className = 'small muted auth-help';
  help.textContent = 'Use the credentials configured for the existing PW Firebase account. Contact a project administrator if you need a password reset.';
  const error = document.createElement('p');
  error.id = 'authError';
  error.className = 'inline-message error hidden';
  error.setAttribute('role', 'alert');
  form.append(submit, help, error);
  oldButton.replaceWith(form);
  oldError?.remove();
}

function questionRow(index, value = '') {
  const row = document.createElement('div');
  row.className = 'question-row';
  const number = document.createElement('span');
  number.className = 'question-number';
  number.textContent = String(index + 1);
  const input = document.createElement('textarea');
  input.rows = 2;
  input.maxLength = 2000;
  input.placeholder = `Question ${index + 1}`;
  input.value = value;
  input.setAttribute('aria-label', `Interview question ${index + 1}`);
  const actions = document.createElement('div');
  actions.className = 'question-actions';
  const moveUp = document.createElement('button');
  moveUp.type = 'button';
  moveUp.className = 'button question-action move-up';
  moveUp.textContent = '↑';
  moveUp.addEventListener('click', () => moveQuestion(row, -1));
  const moveDown = document.createElement('button');
  moveDown.type = 'button';
  moveDown.className = 'button question-action move-down';
  moveDown.textContent = '↓';
  moveDown.addEventListener('click', () => moveQuestion(row, 1));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button question-action remove-row';
  remove.textContent = '×';
  remove.addEventListener('click', () => { row.remove(); renumberQuestions(); });
  actions.append(moveUp, moveDown, remove);
  row.append(number, input, actions);
  return row;
}

function moveQuestion(row, direction) {
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) row.parentElement.insertBefore(row, sibling);
  else row.parentElement.insertBefore(sibling, row);
  renumberQuestions();
  row.querySelector('textarea').focus();
}

function renumberQuestions() {
  const rows = [...$('#questionFields').children];
  rows.forEach((row, index) => {
    row.querySelector('.question-number').textContent = String(index + 1);
    const input = row.querySelector('textarea');
    input.placeholder = `Question ${index + 1}`;
    input.setAttribute('aria-label', `Interview question ${index + 1}`);
    const moveUp = row.querySelector('.move-up');
    const moveDown = row.querySelector('.move-down');
    const remove = row.querySelector('.remove-row');
    moveUp.disabled = index === 0;
    moveDown.disabled = index === rows.length - 1;
    remove.disabled = rows.length === 1;
    moveUp.setAttribute('aria-label', `Move question ${index + 1} up`);
    moveDown.setAttribute('aria-label', `Move question ${index + 1} down`);
    remove.setAttribute('aria-label', `Remove question ${index + 1}`);
  });
}

function addQuestion(value = '') {
  if ($('#questionFields').children.length >= 6) return toast('A session supports up to six questions.');
  $('#questionFields').append(questionRow($('#questionFields').children.length, value));
  renumberQuestions();
}

function addStudent(value = '') {
  if ($('#studentFields').children.length >= 10) return toast('A session supports up to ten students.');
  const index = $('#studentFields').children.length;
  const input = document.createElement('input');
  input.maxLength = 100;
  input.placeholder = `Student ${index + 1} name`;
  input.setAttribute('aria-label', `Student ${index + 1} name`);
  input.value = value;
  $('#studentFields').append(input);
}

function collectSetup() {
  const questions = $$('#questionFields textarea').map((input) => input.value.trim()).filter(Boolean);
  const students = $$('#studentFields input').map((input) => input.value.trim()).filter(Boolean);
  if (!questions.length) throw new Error('Enter at least one interview question.');
  if (!students.length) throw new Error('Enter at least one student name.');
  if (!$('#consentCheck').checked) throw new Error('Confirm that participants have been informed about the recording.');
  return { questions, students };
}

function likelyBluetooth(label = '') { return /airpods|bluetooth|wireless|headset|buds|jabra|rode|dji/i.test(label); }

function renderDevices(devices = []) {
  const select = $('#microphoneSelect');
  const previous = select.value;
  select.replaceChildren(new Option('Default microphone', ''));
  devices.forEach((device, index) => {
    const label = device.label || `Microphone ${index + 1}`;
    select.append(new Option(`${label}${likelyBluetooth(label) ? ' · likely Bluetooth' : ''}`, device.deviceId));
  });
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

const recorder = new DurableRecorder({
  onClipReady: (clipId) => processClip(clipId),
  onDevices: renderDevices,
  onState: ({ state: recorderState, settings, error }) => {
    if (recorderState === 'connected') {
      const option = $('#microphoneSelect').selectedOptions[0];
      const sampleRate = settings?.sampleRate ? ` · ${settings.sampleRate} Hz` : '';
      $('#microphoneStatus').textContent = `Connected: ${option?.textContent || 'Default microphone'}${sampleRate}`;
      $('#microphoneStatus').classList.add('connected');
      $('#activeMicrophone').textContent = option?.textContent || 'Default microphone';
    } else if (recorderState === 'error') {
      const text = error?.message || 'The recorder encountered an error.';
      toast(text);
      $('#queueStatus').textContent = text;
      message($('#setupError'), text, 'error');
    } else if (recorderState === 'recording') {
      renderTranscript();
    }
  }
});

async function connectMicrophone() {
  message($('#setupError'), '');
  try {
    await recorder.connect($('#microphoneSelect').value);
    $('#testMicrophoneButton').textContent = 'Microphone connected';
  } catch (error) {
    message($('#setupError'), error.name === 'NotAllowedError' ? 'Microphone access was not granted. Allow access in browser settings and try again.' : error.message, 'error');
  }
}

function currentQuestion() { return state.session?.questions[state.questionIndex]; }

async function beginCurrentSpeaker() {
  const question = currentQuestion();
  await recorder.begin({ sessionId: state.session.id, questionId: question.id, questionIndex: state.questionIndex, speaker: state.speaker });
}

async function startSession() {
  message($('#setupError'), '');
  try {
    const { questions, students } = collectSetup();
    if (!recorder.stream) await recorder.connect($('#microphoneSelect').value);
    await requestPersistentStorage().catch(() => false);
    const now = new Date().toISOString();
    state.session = {
      id: crypto.randomUUID(),
      title: questions[0],
      questions: questions.map((text) => ({ id: crypto.randomUUID(), text })),
      students,
      state: 'recording',
      createdAt: now,
      analyses: []
    };
    state.questionIndex = 0;
    state.speaker = 'Teacher';
    state.startedAt = Date.now();
    await putSession(state.session);
    renderRecording();
    show($('#setupView'), false);
    show($('#recordingView'), true);
    await beginCurrentSpeaker();
    state.timer = setInterval(renderTimer, 1000);
  } catch (error) {
    message($('#setupError'), error.message, 'error');
  }
}

function renderTimer() {
  const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
  $('#elapsedTime').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderRecording() {
  const question = currentQuestion();
  $('#questionProgress').textContent = `Question ${state.questionIndex + 1} of ${state.session.questions.length}`;
  $('#currentQuestion').textContent = question.text;
  $('#nextQuestionButton').disabled = state.questionIndex >= state.session.questions.length - 1;
  const container = $('#speakerButtons');
  container.replaceChildren();
  ['Teacher', ...state.session.students].forEach((speaker) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `speaker-button${speaker === state.speaker ? ' active' : ''}`;
    button.textContent = speaker;
    button.setAttribute('aria-pressed', String(speaker === state.speaker));
    button.addEventListener('click', () => switchSpeaker(speaker));
    container.append(button);
  });
  renderTranscript();
}

async function switchSpeaker(speaker) {
  if (speaker === state.speaker) return;
  [...$('#speakerButtons').children].forEach((button) => { button.disabled = true; });
  try {
    await recorder.stopClip();
    state.speaker = speaker;
    renderRecording();
    await beginCurrentSpeaker();
  } catch (error) { toast(error.message); }
}

async function nextQuestion() {
  if (state.questionIndex >= state.session.questions.length - 1) return;
  $('#nextQuestionButton').disabled = true;
  try {
    await recorder.stopClip();
    state.questionIndex += 1;
    state.speaker = 'Teacher';
    renderRecording();
    await beginCurrentSpeaker();
    await putSession(state.session);
  } catch (error) { toast(error.message); }
}

async function processClip(clipId) {
  const existing = state.processing.get(clipId);
  if (existing) return existing;
  const task = (async () => {
    try {
      const clip = await getClip(clipId);
      if (!clip || clip.status === 'complete') return;
      const blob = await getClipBlob(clip);
      if (blob.size < 512) {
        await updateClip(clipId, { status: 'failed', error: 'Clip was too short to transcribe', attempts: (clip.attempts || 0) + 1 });
        return;
      }
      await updateClip(clipId, { status: 'uploading', error: '', attempts: (clip.attempts || 0) + 1 });
      renderTranscript();
      const session = await getSession(clip.sessionId);
      const question = session?.questions.find((item) => item.id === clip.questionId);
      const form = new FormData();
      form.append('audio', blob, `${clip.id}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
      form.append('clipId', clip.id);
      form.append('hints', [...(session?.students || []), question?.text || ''].join(', '));
      const result = await api('/api/transcribe', { method: 'POST', body: form });
      await updateClip(clip.id, { status: 'complete', transcript: result.text, error: '', transcribedAt: new Date().toISOString() });
    } catch (error) {
      await updateClip(clipId, { status: 'failed', error: error.message }).catch(() => {});
    } finally {
      state.processing.delete(clipId);
      await updateQueueStatus();
      if (state.session) await renderTranscript();
    }
  })();
  state.processing.set(clipId, task);
  return task;
}

async function retryPending() {
  const pending = await listPendingClips();
  if (!pending.length) return toast('There are no pending clips.');
  toast(`Retrying ${pending.length} clip${pending.length === 1 ? '' : 's'}…`);
  for (const clip of pending) await processClip(clip.id);
  if (!$('#completeView').classList.contains('hidden')) await renderCompletion();
}

async function updateQueueStatus() {
  const pending = await listPendingClips();
  $('#pendingCount').textContent = String(pending.length);
  const pendingLabel = `${pending.length} clip${pending.length === 1 ? '' : 's'} safely stored and awaiting transcription.`;
  $('#queueStatus').textContent = pending.length ? pendingLabel : 'All recorded audio is backed up locally and transcribed.';
  if (state.session) $('#summaryPending').textContent = String(pending.filter((clip) => clip.sessionId === state.session.id).length);
}

async function renderTranscript() {
  if (!state.session) return;
  const clips = (await listClips(state.session.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const current = clips.filter((clip) => clip.questionId === currentQuestion().id);
  const container = $('#transcriptList');
  container.replaceChildren();
  if (!current.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Transcribed speech will appear here.'; container.append(empty); return;
  }
  current.forEach((clip) => {
    const entry = document.createElement('div');
    let statusClass = 'pending';
    if (clip.status === 'complete') statusClass = '';
    else if (clip.status === 'failed') statusClass = 'failed';
    else if (clip.status === 'recording') statusClass = 'listening';
    entry.className = `transcript-entry ${statusClass}`;
    const speaker = document.createElement('strong'); speaker.textContent = clip.speaker;
    let clipText = 'Saved locally · waiting to transcribe…';
    if (clip.status === 'recording') clipText = 'Listening…';
    else if (clip.status === 'uploading') clipText = 'Saved locally · transcribing…';
    if (clip.status === 'complete') clipText = clip.transcript || 'No speech detected';
    else if (clip.status === 'failed') clipText = `Saved locally · transcription failed: ${clip.error || 'retry needed'}`;
    const text = document.createElement('span'); text.textContent = clipText;
    const meta = document.createElement('small'); meta.textContent = new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    entry.append(speaker, text, meta); container.append(entry);
  });
}

async function endSession() {
  $('#endSessionButton').disabled = true;
  clearInterval(state.timer);
  show($('#recordingView'), false);
  show($('#finalizingView'), true);
  $('#finalizingTitle').textContent = `Saving ${state.speaker}’s final recording…`;
  $('#finalizingStatus').textContent = 'Please keep this page open. The audio is already backed up on this device.';
  try {
    const finalClipId = await recorder.disconnect();
    if (finalClipId) {
      $('#finalizingTitle').textContent = `Transcribing ${state.speaker}…`;
      $('#finalizingStatus').textContent = 'The final locally saved clip is being transcribed. This screen will continue automatically.';
      await processClip(finalClipId);
    }
    const remaining = (await listPendingClips()).filter((clip) => clip.sessionId === state.session.id && clip.id !== finalClipId);
    if (remaining.length) {
      $('#finalizingTitle').textContent = 'Finishing the transcript…';
      $('#finalizingStatus').textContent = `Completing ${remaining.length} locally saved clip${remaining.length === 1 ? '' : 's'} before review.`;
      await Promise.all(remaining.map((clip) => processClip(clip.id)));
    }
    state.session.state = 'complete';
    state.session.completedAt = new Date().toISOString();
    await putSession(state.session);
    show($('#finalizingView'), false);
    show($('#completeView'), true);
    await renderCompletion();
  } catch (error) {
    toast(error.message);
    show($('#finalizingView'), false);
    show($('#recordingView'), true);
    $('#endSessionButton').disabled = false;
  }
}

async function allSessionClips() {
  return (await listClips(state.session.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function renderCompletion() {
  const clips = await allSessionClips();
  $('#summaryQuestions').textContent = String(state.session.questions.length);
  $('#summarySegments').textContent = String(clips.filter((clip) => clip.status === 'complete').length);
  const container = $('#reviewTranscript');
  container.replaceChildren();
  state.session.questions.forEach((question, index) => {
    const section = document.createElement('section'); section.className = 'review-question';
    const heading = document.createElement('h3'); heading.textContent = `Question ${index + 1}: ${question.text}`; section.append(heading);
    const questionClips = clips.filter((clip) => clip.questionId === question.id);
    if (!questionClips.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No recorded clips.'; section.append(empty); }
    questionClips.forEach((clip) => { const line = document.createElement('p'); line.className = 'review-line'; const strong = document.createElement('strong'); strong.textContent = `${clip.speaker}: `; const text = clip.status === 'complete' ? (clip.transcript || 'No speech detected') : `Transcription failed — audio is saved locally. ${clip.error || 'Use Retry pending clips.'}`; line.append(strong, document.createTextNode(text)); section.append(line); });
    container.append(section);
  });
  await updateQueueStatus();
  await loadPrompts();
}

function transcriptFor(question, clips) {
  return clips.filter((clip) => clip.questionId === question.id && clip.status === 'complete').map((clip) => `[${clip.speaker}]: ${clip.transcript}`).join('\n\n');
}

async function runAnalysis() {
  const prompt = $('#analysisPrompt').value.trim();
  if (!prompt) return message($('#analysisStatus'), 'Choose a saved prompt or enter analysis instructions.', 'error');
  const clips = await allSessionClips();
  const questions = [];
  $('#runAnalysisButton').disabled = true;
  $('#runAnalysisButton').setAttribute('aria-busy', 'true');
  try {
    for (let index = 0; index < state.session.questions.length; index += 1) {
      const question = state.session.questions[index];
      const transcript = transcriptFor(question, clips);
      if (!transcript) continue;
      message($('#analysisStatus'), `Analysing question ${index + 1}…`);
      const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ prompt, transcript, question: question.text, studentNames: state.session.students }) });
      questions.push({ questionId: question.id, question: question.text, analysis: result.analysis });
    }
    if (!questions.length) throw new Error('No completed transcripts are available for analysis. Retry pending clips first.');
    const selectedPrompt = state.prompts.find((item) => item._id === $('#promptSelect').value);
    const record = {
      id: crypto.randomUUID(),
      title: `Analysis ${state.session.analyses.length + 1}`,
      promptId: selectedPrompt?._id || null,
      promptName: selectedPrompt?.name || 'Custom instructions',
      prompt,
      questions,
      createdAt: new Date().toISOString()
    };
    $('#analysisResult').replaceChildren(renderAnalysis(record));
    show($('#analysisResult'), true);
    $('#downloadLatestAnalysisButton').onclick = () => download(
      new Blob([analysisAsText(record, state.session.title)], { type: 'text/plain;charset=utf-8' }),
      analysisFilename(record)
    );
    show($('#downloadLatestAnalysisButton'), true);
    message($('#analysisStatus'), 'Analysis complete. It is saved only in this browser and is available in Session history.', 'success');
    state.session.analyses.push(record);
    await putSession(state.session);
  } catch (error) { message($('#analysisStatus'), error.message, 'error'); }
  finally { $('#runAnalysisButton').disabled = false; $('#runAnalysisButton').removeAttribute('aria-busy'); }
}

async function loadPrompts() {
  const selects = [$('#promptSelect'), $('#promptList')];
  selects.forEach((select) => { select.disabled = true; select.setAttribute('aria-busy', 'true'); });
  if ($('#promptDialog').open) message($('#promptStatus'), 'Loading saved prompts…');
  try {
    const data = await api('/api/prompts');
    state.prompts = data.prompts || [];
    state.defaultPromptId = data.defaultPromptId || null;
    selects.forEach((select) => {
      const selected = select.value;
      select.replaceChildren();
      if (select.id === 'promptSelect' && !state.defaultPromptId) select.append(new Option('Select a prompt', ''));
      state.prompts.forEach((prompt) => {
        const name = prompt.name || 'Untitled prompt';
        select.append(new Option(prompt._id === state.defaultPromptId ? `[default] - ${name}` : name, prompt._id));
      });
      const nextValue = [...select.options].some((option) => option.value === selected) ? selected : state.defaultPromptId;
      if (nextValue && [...select.options].some((option) => option.value === nextValue)) select.value = nextValue;
    });
    const selectedPromptId = $('#promptSelect').value;
    if (selectedPromptId && !$('#analysisPrompt').value.trim()) await selectPrompt(selectedPromptId);
    updateDefaultPromptButton();
    if ($('#promptDialog').open) message($('#promptStatus'), 'Prompts ready.', 'success');
  } catch (error) {
    toast(`Prompts unavailable: ${error.message}`);
    if ($('#promptDialog').open) message($('#promptStatus'), `Prompts unavailable: ${error.message}`, 'error');
  } finally {
    selects.forEach((select) => { select.disabled = false; select.removeAttribute('aria-busy'); });
  }
}

function updateDefaultPromptButton() {
  const button = $('#setDefaultPromptButton');
  show(button, state.promptAdmin);
  button.disabled = !state.activePromptId || state.activePromptId === state.defaultPromptId;
  button.textContent = state.activePromptId === state.defaultPromptId ? 'Current default' : 'Set as default';
}

async function selectPrompt(id, destination = 'analysis') {
  if (!id) return;
  try {
    const prompt = await api(`/api/prompts/${encodeURIComponent(id)}`);
    if (destination === 'analysis') $('#analysisPrompt').value = prompt.text || '';
    else { state.activePromptId = prompt._id; $('#promptName').value = prompt.name || ''; $('#promptText').value = prompt.text || ''; updateDefaultPromptButton(); }
  } catch (error) { toast(error.message); }
}

async function setDefaultPrompt() {
  if (!state.activePromptId) return message($('#promptStatus'), 'Select a prompt first.', 'error');
  try {
    await api(`/api/prompts/${encodeURIComponent(state.activePromptId)}/default`, { method: 'PUT' });
    state.defaultPromptId = state.activePromptId;
    message($('#promptStatus'), 'Default prompt updated for all teachers.', 'success');
    await loadPrompts();
  } catch (error) { message($('#promptStatus'), error.message, 'error'); }
}

async function savePrompt() {
  const name = $('#promptName').value.trim(); const text = $('#promptText').value.trim();
  if (!name || !text) return message($('#promptStatus'), 'Enter a name and instructions.', 'error');
  try {
    const path = state.activePromptId ? `/api/prompts/${encodeURIComponent(state.activePromptId)}` : '/api/prompts';
    const result = await api(path, { method: state.activePromptId ? 'PUT' : 'POST', body: JSON.stringify({ name, text }) });
    if (!state.activePromptId) state.activePromptId = result.id;
    message($('#promptStatus'), 'Prompt saved.', 'success'); await loadPrompts();
  } catch (error) { message($('#promptStatus'), error.message, 'error'); }
}

async function deletePrompt() {
  if (!state.activePromptId || !confirm('Delete this shared prompt?')) return;
  try { await api(`/api/prompts/${encodeURIComponent(state.activePromptId)}`, { method: 'DELETE' }); state.activePromptId = null; $('#promptName').value = ''; $('#promptText').value = ''; message($('#promptStatus'), 'Prompt deleted.', 'success'); await loadPrompts(); }
  catch (error) { message($('#promptStatus'), error.message, 'error'); }
}

async function downloadBackup() {
  const clips = await allSessionClips();
  const payload = { format: 'pw-grq-backup/v2', exportedAt: new Date().toISOString(), session: state.session, clips: clips.map(({ id, questionId, speaker, status, transcript, error, createdAt, completedAt, mimeType }) => ({ id, questionId, speaker, status, transcript, error, createdAt, completedAt, mimeType })) };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `pw-grq-${state.session.id}.json`);
}

async function downloadAudio() {
  const clips = await allSessionClips();
  const button = $('#downloadAudioButton');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  toast('Preparing one audio ZIP…');
  try {
    const archive = await createAudioZip(state.session, clips, getClipBlob);
    download(archive.blob, archive.filename);
    toast(`Downloaded one ZIP containing ${archive.entryCount} audio clip${archive.entryCount === 1 ? '' : 's'}.`);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

async function serviceHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const health = await response.json();
    $('#serviceStatus').textContent = health.status === 'ready' ? 'Transcription and analysis ready' : 'Some server services need configuration';
    $('#serviceDot').className = `status-dot ${health.status === 'ready' ? 'ready' : 'error'}`;
  } catch { $('#serviceStatus').textContent = 'Server unavailable'; $('#serviceDot').className = 'status-dot error'; }
}

async function storageHealth() {
  const estimate = await storageEstimate();
  $('#storageStatus').textContent = estimate ? `${formatBytes(estimate.usage)} used · ${formatBytes(estimate.quota)} available` : 'IndexedDB ready';
}

async function refreshLocalStatus() {
  if (statusRefreshRunning) {
    statusRefreshQueued = true;
    return;
  }
  statusRefreshRunning = true;
  try {
    await Promise.all([storageHealth(), updateQueueStatus()]);
  } finally {
    statusRefreshRunning = false;
    if (statusRefreshQueued) {
      statusRefreshQueued = false;
      scheduleLocalStatusRefresh(0);
    }
  }
}

function scheduleLocalStatusRefresh(delay = 250) {
  clearTimeout(statusRefreshTimer);
  statusRefreshTimer = setTimeout(() => refreshLocalStatus().catch(() => {}), delay);
}

async function refreshAllStatus() {
  serviceRefreshedAt = Date.now();
  await Promise.all([serviceHealth(), refreshLocalStatus()]);
}

function startStatusAutoRefresh() {
  if (statusAutoRefreshStarted) return;
  statusAutoRefreshStarted = true;
  window.addEventListener(DATA_CHANGE_EVENT, () => scheduleLocalStatusRefresh());
  window.addEventListener('focus', () => refreshAllStatus().catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAllStatus().catch(() => {});
  });
  window.addEventListener('online', () => {
    retryPending();
    refreshAllStatus().catch(() => {});
  });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    scheduleLocalStatusRefresh(0);
    if (Date.now() - serviceRefreshedAt >= 60_000) {
      serviceRefreshedAt = Date.now();
      serviceHealth();
    }
  }, 10_000);
}

async function initializeApp() {
  try {
    const authState = await initializeAuthentication();
    if (authState.required && !authState.user) {
      show($('#appLoading'), false);
      show($('#authGate'), true);
      return;
    }
    setActiveOwner(authState.user.uid);
    state.promptAdmin = Boolean(authState.user.promptAdmin);
    $('#startupStatus').textContent = 'Recovering locally saved recordings and checking services.';
    await migrateLegacyHistory();
    await recoverInterruptedClips();
    await Promise.all([serviceHealth(), storageHealth(), updateQueueStatus(), recorder.devices()]);
    serviceRefreshedAt = Date.now();
    startStatusAutoRefresh();
    show($('#appLoading'), false);
    show($('#appNavigation'), true);
    show($('#signOutButton'), authState.required);
    show($('#appRoot'), true);
    const pending = await listPendingClips();
    for (const clip of pending) processClip(clip.id);
  } catch (error) {
    show($('#appLoading'), false);
    show($('#authGate'), true);
    message($('#authError'), error.message, 'error');
  }
}

ensurePasswordForm();

$('#addQuestionButton').addEventListener('click', () => addQuestion());
$('#addStudentButton').addEventListener('click', () => addStudent());
$('#testMicrophoneButton').addEventListener('click', connectMicrophone);
$('#refreshDevicesButton').addEventListener('click', () => recorder.devices());
$('#startSessionButton').addEventListener('click', startSession);
$('#nextQuestionButton').addEventListener('click', nextQuestion);
$('#endSessionButton').addEventListener('click', endSession);
$('#retryButton').addEventListener('click', retryPending);
$('#retryCompleteButton').addEventListener('click', retryPending);
$('#downloadBackupButton').addEventListener('click', downloadBackup);
$('#downloadAudioButton').addEventListener('click', downloadAudio);
$('#runAnalysisButton').addEventListener('click', runAnalysis);
$('#reloadPromptsButton').addEventListener('click', loadPrompts);
$('#promptSelect').addEventListener('change', (event) => selectPrompt(event.target.value));
$('#newSessionButton').addEventListener('click', () => location.reload());
$('#signInForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#signInButton');
  message($('#authError'), '');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await signInTeacher($('#signInEmail').value, $('#signInPassword').value);
    location.reload();
  } catch (error) {
    message($('#authError'), error.message, 'error');
    $('#signInPassword').value = '';
    $('#signInPassword').focus();
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
$('#forgotPasswordButton').addEventListener('click', async () => {
  const email = $('#signInEmail');
  if (!email.value.trim() || !email.checkValidity()) {
    message($('#authError'), 'Enter your RI email address first.', 'error');
    email.focus();
    return;
  }
  const button = $('#forgotPasswordButton');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  message($('#authError'), 'Requesting a password reset…');
  try {
    await requestPasswordReset(email.value);
    message($('#authError'), 'If this address has an account, Firebase has sent a password reset email. Check your inbox and spam folder.', 'success');
  } catch (error) {
    message($('#authError'), error.message, 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
$('#signOutButton').addEventListener('click', async () => { await signOutTeacher(); location.reload(); });
$('#promptLibraryButton').addEventListener('click', async () => {
  $('#promptDialog').showModal();
  message($('#promptStatus'), 'Loading saved prompts…');
  await loadPrompts();
});
$('#promptList').addEventListener('change', (event) => selectPrompt(event.target.value, 'library'));
$('#newPromptButton').addEventListener('click', () => { state.activePromptId = null; $('#promptName').value = ''; $('#promptText').value = ''; message($('#promptStatus'), ''); updateDefaultPromptButton(); $('#promptName').focus(); });
$('#savePromptButton').addEventListener('click', savePrompt);
$('#deletePromptButton').addEventListener('click', deletePrompt);
$('#setDefaultPromptButton').addEventListener('click', setDefaultPrompt);
navigator.mediaDevices?.addEventListener?.('devicechange', () => recorder.devices());
window.addEventListener('beforeunload', (event) => {
  if (!recorder.hasPendingPersistence()) return;
  event.preventDefault();
  event.returnValue = ''; // NOSONAR: required by Safari/Chromium beforeunload compatibility.
});

addQuestion();
for (let index = 0; index < 5; index += 1) addStudent();
initializeApp();
