'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');

const outfile = path.join(os.tmpdir(), `pw-grq-recorder-test-${process.pid}.cjs`);
class MockMediaRecorder {
  static isTypeSupported() { return true; }
  constructor() { this.state = 'inactive'; this.listeners = new Map(); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  start() { this.state = 'recording'; }
  requestData() { this.ondataavailable?.({ data: new Blob(['durable audio']) }); }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => this.listeners.get('stop')?.());
  }
}

test('a saved clip rotates without waiting for network transcription', async () => {
  await build({
    entryPoints: [path.join(__dirname, '../src/client/recorder.js')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    plugins: [{
      name: 'durable-store-mock',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/db\.js$/ }, () => ({ path: 'db-mock', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents: `
            export async function createClip(clip) { globalThis.__recorderTest.clips.push(clip); }
            export async function appendChunk(id, sequence, blob) { globalThis.__recorderTest.chunks.push({ id, sequence, size: blob.size }); }
            export async function updateClip(id, patch) { globalThis.__recorderTest.updates.push({ id, patch }); }
          `,
          loader: 'js'
        }));
      }
    }]
  });
  global.__recorderTest = { clips: [], chunks: [], updates: [] };
  global.MediaRecorder = MockMediaRecorder;
  const track = { stop() {}, getSettings: () => ({ sampleRate: 48000 }) };
  global.navigator = {
    mediaDevices: {
      getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }),
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Test microphone' }]
    }
  };

  let finishUpload;
  const upload = new Promise((resolve) => { finishUpload = resolve; });
  const { DurableRecorder } = require(outfile);
  const recorder = new DurableRecorder({ onClipReady: () => upload });
  await recorder.connect('mic-1');
  await recorder.begin({ sessionId: 'session', questionId: 'question', questionIndex: 0, speaker: 'Teacher' });

  const stopPromise = recorder.stopClip();
  assert.equal(recorder.hasPendingPersistence(), true);
  const stopped = await Promise.race([
    stopPromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 100))
  ]);
  assert.equal(stopped, true, 'local save must not wait for the transcription network request');
  assert.equal(recorder.hasPendingPersistence(), false);
  const clipId = global.__recorderTest.clips[0].id;
  assert.deepEqual(global.__recorderTest.chunks, [{ id: clipId, sequence: 0, size: 13 }]);
  assert.equal(global.__recorderTest.updates.at(-1).patch.status, 'ready');
  finishUpload();
});

test('disconnect returns the final durable clip ID without waiting for transcription', async () => {
  global.__recorderTest = { clips: [], chunks: [], updates: [] };
  global.MediaRecorder = MockMediaRecorder;
  const track = { stopped: false, stop() { this.stopped = true; }, getSettings: () => ({ sampleRate: 48000 }) };
  global.navigator = {
    mediaDevices: {
      getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }),
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Test microphone' }]
    }
  };

  let finishUpload;
  const upload = new Promise((resolve) => { finishUpload = resolve; });
  const { DurableRecorder } = require(outfile);
  const recorder = new DurableRecorder({ onClipReady: () => upload });
  await recorder.connect('mic-1');
  await recorder.begin({ sessionId: 'session', questionId: 'question', questionIndex: 0, speaker: 'Teacher' });

  const finalClipId = await recorder.disconnect();
  assert.equal(finalClipId, global.__recorderTest.clips[0].id);
  assert.equal(global.__recorderTest.updates.at(-1).patch.status, 'ready');
  assert.equal(track.stopped, true);
  finishUpload();
});
