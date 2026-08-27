const DB_NAME = 'pw-grq-recorder';
const DB_VERSION = 3;
export const DATA_CHANGE_EVENT = 'pw-grq:data-changed';
let activeOwnerUid = '';

const changeChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('pw-grq-data-changes')
  : null;

function dispatchDataChange(detail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail }));
}

function notifyDataChange(kind) {
  const detail = { kind, ownerUid: activeOwnerUid, changedAt: Date.now() };
  dispatchDataChange(detail);
  changeChannel?.postMessage(detail);
}

changeChannel?.addEventListener('message', (event) => {
  if (event.data?.ownerUid && event.data.ownerUid === activeOwnerUid) dispatchDataChange(event.data);
});

export function setActiveOwner(uid) {
  if (typeof uid !== 'string' || !uid.trim()) throw new Error('A verified local-data owner is required');
  activeOwnerUid = uid.trim();
}

function ownerUid() {
  if (!activeOwnerUid) throw new Error('Local data is locked until sign-in is verified');
  return activeOwnerUid;
}

function owned(record) {
  return record?.ownerUid === ownerUid();
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted'));
  });
}

let dbPromise;

export function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('clips')) {
          const clips = db.createObjectStore('clips', { keyPath: 'id' });
          clips.createIndex('sessionId', 'sessionId');
          clips.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const chunks = db.createObjectStore('chunks', { keyPath: ['clipId', 'sequence'] });
          chunks.createIndex('clipId', 'clipId');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other PW GRQ tabs to upgrade local storage'));
    });
  }
  return dbPromise;
}

async function store(name, mode = 'readonly') {
  const db = await openDatabase();
  const transaction = db.transaction(name, mode);
  return { transaction, store: transaction.objectStore(name) };
}

export async function putSession(session) {
  const { transaction, store: sessions } = await store('sessions', 'readwrite');
  if (session.ownerUid && session.ownerUid !== ownerUid()) throw new Error('Session belongs to another signed-in teacher');
  sessions.put({ ...session, ownerUid: ownerUid(), updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  notifyDataChange('session');
}

export async function getSession(id) {
  const { store: sessions } = await store('sessions');
  const result = await requestResult(sessions.get(id));
  return owned(result) ? result : undefined;
}

export async function listSessions() {
  const { store: sessions } = await store('sessions');
  const result = await requestResult(sessions.getAll());
  return result.filter(owned).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createClip(clip) {
  const { transaction, store: clips } = await store('clips', 'readwrite');
  clips.add({ ...clip, ownerUid: ownerUid(), status: 'recording', finalized: false, committedChunks: 0, committedBytes: 0, attempts: 0, createdAt: new Date().toISOString() });
  await transactionDone(transaction);
  notifyDataChange('clip');
}

export async function appendChunk(clipId, sequence, blob) {
  const db = await openDatabase();
  const transaction = db.transaction(['clips', 'chunks'], 'readwrite');
  const done = transactionDone(transaction);
  const clips = transaction.objectStore('clips');
  const chunks = transaction.objectStore('chunks');
  const clip = await requestResult(clips.get(clipId));
  if (!owned(clip)) {
    transaction.abort();
    await done.catch(() => {});
    throw new Error('Audio clip belongs to another signed-in teacher');
  }
  chunks.put({ clipId, ownerUid: ownerUid(), sequence, blob, bytes: blob.size, createdAt: Date.now() });
  clips.put({ ...clip, committedChunks: Math.max(clip.committedChunks || 0, sequence + 1), committedBytes: (clip.committedBytes || 0) + blob.size, updatedAt: new Date().toISOString() });
  await done;
  notifyDataChange('audio');
}

export async function updateClip(id, patch) {
  const { transaction, store: clips } = await store('clips', 'readwrite');
  const current = await requestResult(clips.get(id));
  if (!owned(current)) throw new Error('Audio clip not found in this teacher’s local backup');
  clips.put({ ...current, ...patch, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  notifyDataChange('clip');
}

export async function getClip(id) {
  const { store: clips } = await store('clips');
  const result = await requestResult(clips.get(id));
  return owned(result) ? result : undefined;
}

export async function listClips(sessionId) {
  const { store: clips } = await store('clips');
  const result = await requestResult(clips.index('sessionId').getAll(sessionId));
  return result.filter(owned);
}

export async function listPendingClips() {
  const { store: clips } = await store('clips');
  const all = await requestResult(clips.getAll());
  return all.filter((clip) => owned(clip) && ['ready', 'failed', 'uploading'].includes(clip.status) && clip.finalized);
}

export async function getClipBlob(clip) {
  if (!owned(clip)) throw new Error('Audio clip belongs to another signed-in teacher');
  const { store: chunks } = await store('chunks');
  const rows = await requestResult(chunks.index('clipId').getAll(clip.id));
  rows.sort((a, b) => a.sequence - b.sequence);
  if (clip.finalized) {
    const expected = Number(clip.expectedChunks);
    const byteTotal = rows.reduce((sum, row) => sum + row.blob.size, 0);
    const contiguous = Number.isInteger(expected)
      && expected === rows.length
      && rows.every((row, index) => row.sequence === index && row.ownerUid === ownerUid() && row.bytes === row.blob.size)
      && byteTotal === clip.committedBytes;
    if (!contiguous) throw new Error('Audio integrity check failed; this clip will not be uploaded automatically');
  }
  return new Blob(rows.map((row) => row.blob), { type: clip.mimeType || 'audio/webm' });
}

export async function recoverInterruptedClips() {
  const { store: clipsStore } = await store('clips');
  const clips = (await requestResult(clipsStore.getAll())).filter(owned);
  await Promise.all(clips.filter((clip) => ['recording', 'uploading'].includes(clip.status)).map((clip) => {
    const complete = clip.finalized && clip.expectedChunks === clip.committedChunks;
    return updateClip(clip.id, complete
      ? { status: 'ready', error: 'Recovered after an interrupted upload' }
      : { status: 'incomplete', error: 'Recording was interrupted before audio integrity could be confirmed. Download and review this clip; it will not be uploaded automatically.' });
  }));
}

export async function deleteSession(id) {
  const db = await openDatabase();
  const session = await getSession(id);
  if (!session) throw new Error('Session not found in this teacher’s local data');
  const clips = await listClips(id);
  const transaction = db.transaction(['sessions', 'clips', 'chunks'], 'readwrite');
  transaction.objectStore('sessions').delete(id);
  for (const clip of clips) {
    transaction.objectStore('clips').delete(clip.id);
    const range = IDBKeyRange.bound([clip.id, 0], [clip.id, Number.MAX_SAFE_INTEGER]);
    transaction.objectStore('chunks').delete(range);
  }
  await transactionDone(transaction);
  notifyDataChange('session');
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

export async function migrateLegacyHistory() {
  if (ownerUid() !== 'local-prototype') return;
  const marker = 'pw-grq-legacy-migrated';
  if (localStorage.getItem(marker)) return;
  try {
    const legacy = JSON.parse(localStorage.getItem('interviewHistory') || '[]');
    for (const item of legacy) {
      await putSession({
        id: String(item.id || crypto.randomUUID()),
        title: item.question || 'Imported interview',
        students: item.students || [],
        questions: item.fullSessionData?.questions || [{ id: crypto.randomUUID(), text: item.question || 'Imported question' }],
        legacyTranscript: item.transcription || [],
        analyses: item.analyses || [],
        state: 'imported',
        createdAt: item.timestamp || new Date().toISOString()
      });
    }
    localStorage.setItem(marker, 'true');
  } catch (error) {
    console.warn('Legacy history could not be migrated:', error);
  }
}
