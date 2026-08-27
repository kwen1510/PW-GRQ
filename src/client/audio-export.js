import { zipSync } from 'fflate';

function safePart(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-');
  let start = 0;
  let end = normalized.length;
  while (start < end && normalized[start] === '-') start += 1;
  while (end > start && normalized[end - 1] === '-') end -= 1;
  const cleaned = normalized.slice(start, end).slice(0, 80);
  return cleaned || fallback;
}

function extensionFor(blob) {
  if (blob.type.includes('mp4')) return 'm4a';
  if (blob.type.includes('ogg')) return 'ogg';
  if (blob.type.includes('wav')) return 'wav';
  return 'webm';
}

export async function createAudioZip(session, clips, getBlob) {
  if (!clips.length) throw new Error('This session has no audio clips to download.');
  const files = {};
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const blob = await getBlob(clip);
    const question = String((clip.questionIndex || 0) + 1).padStart(2, '0');
    const sequence = String(index + 1).padStart(3, '0');
    const speaker = safePart(clip.speaker, 'speaker');
    files[`q${question}-${sequence}-${speaker}.${extensionFor(blob)}`] = new Uint8Array(await blob.arrayBuffer());
  }
  const title = safePart(session.title, 'session-audio');
  return {
    blob: new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }),
    filename: `${title}-audio.zip`,
    entryCount: clips.length
  };
}
