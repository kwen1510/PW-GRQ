'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { buildSync } = require('esbuild');
require('fake-indexeddb/auto');

global.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); }
};

const outfile = path.join(os.tmpdir(), `pw-grq-db-test-${process.pid}.cjs`);
buildSync({ entryPoints: [path.join(__dirname, '../src/client/db.js')], outfile, bundle: true, platform: 'node', format: 'cjs' });
const db = require(outfile);

test('audio chunks survive interruption, reconstruct, and delete with the session', async () => {
  db.setActiveOwner('teacher-1');
  const session = { id: 'session-1', title: 'Test', questions: [{ id: 'q1', text: 'Question' }], students: ['A'], createdAt: new Date().toISOString() };
  await db.putSession(session);
  await db.createClip({ id: 'clip-1', sessionId: session.id, questionId: 'q1', speaker: 'A', mimeType: 'audio/webm' });
  await db.appendChunk('clip-1', 0, new Blob(['first']));
  await db.appendChunk('clip-1', 1, new Blob(['second']));
  await db.updateClip('clip-1', { finalized: true, expectedChunks: 2 });
  await db.recoverInterruptedClips();
  const recovered = await db.getClip('clip-1');
  assert.equal(recovered.status, 'ready');
  const blob = await db.getClipBlob(recovered);
  assert.equal(await blob.text(), 'firstsecond');
  db.setActiveOwner('teacher-2');
  assert.equal((await db.listSessions()).length, 0);
  assert.equal(await db.getSession(session.id), undefined);
  db.setActiveOwner('teacher-1');
  await db.deleteSession(session.id);
  assert.equal(await db.getSession(session.id), undefined);
  assert.equal((await db.listClips(session.id)).length, 0);
});

test('unfinalized or non-contiguous audio is quarantined instead of retried', async () => {
  db.setActiveOwner('teacher-integrity');
  await db.putSession({ id: 'session-integrity', title: 'Integrity', createdAt: new Date().toISOString() });
  await db.createClip({ id: 'missing-first', sessionId: 'session-integrity', questionId: 'q1', mimeType: 'audio/webm' });
  await db.appendChunk('missing-first', 1, new Blob(['second']));
  await db.updateClip('missing-first', { finalized: true, expectedChunks: 2, status: 'ready' });
  const broken = await db.getClip('missing-first');
  await assert.rejects(() => db.getClipBlob(broken), /integrity check failed/);

  await db.createClip({ id: 'interrupted', sessionId: 'session-integrity', questionId: 'q1', mimeType: 'audio/webm' });
  await db.appendChunk('interrupted', 0, new Blob(['partial']));
  await db.recoverInterruptedClips();
  assert.equal((await db.getClip('interrupted')).status, 'incomplete');
  assert.equal((await db.listPendingClips()).some((clip) => clip.id === 'interrupted'), false);
});
