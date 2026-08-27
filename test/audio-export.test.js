'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');
const { unzipSync, strFromU8 } = require('fflate');

test('session audio export produces one ZIP containing every clip', async () => {
  const outfile = path.join(os.tmpdir(), `pw-grq-audio-export-${process.pid}.cjs`);
  await build({
    entryPoints: [path.join(__dirname, '../src/client/audio-export.js')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs'
  });
  const { createAudioZip } = require(outfile);
  const clips = [
    { id: 'one', questionIndex: 0, speaker: 'Teacher' },
    { id: 'two', questionIndex: 1, speaker: 'Student A' }
  ];
  const blobs = new Map([
    ['one', new Blob(['first audio'], { type: 'audio/webm' })],
    ['two', new Blob(['second audio'], { type: 'audio/mp4' })]
  ]);

  const archive = await createAudioZip({ title: 'GRQ: Test / Session' }, clips, async (clip) => blobs.get(clip.id));
  assert.equal(archive.filename, 'GRQ-Test-Session-audio.zip');
  assert.equal(archive.entryCount, 2);
  assert.equal(archive.blob.type, 'application/zip');

  const files = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files).sort(), ['q01-001-Teacher.webm', 'q02-002-Student-A.m4a']);
  assert.equal(strFromU8(files['q01-001-Teacher.webm']), 'first audio');
  assert.equal(strFromU8(files['q02-002-Student-A.m4a']), 'second audio');
});

test('session audio export safely trims long punctuation-heavy names', async () => {
  const outfile = path.join(os.tmpdir(), `pw-grq-audio-export-edge-${process.pid}.cjs`);
  await build({
    entryPoints: [path.join(__dirname, '../src/client/audio-export.js')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs'
  });
  const { createAudioZip } = require(outfile);
  const archive = await createAudioZip(
    { title: `${'-'.repeat(10_000)} Session ${'-'.repeat(10_000)}` },
    [{ id: 'one', questionIndex: 0, speaker: `${'-'.repeat(10_000)} Teacher ${'-'.repeat(10_000)}` }],
    async () => new Blob(['audio'], { type: 'audio/webm' })
  );

  assert.equal(archive.filename, 'Session-audio.zip');
  const files = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ['q01-001-Teacher.webm']);
});
