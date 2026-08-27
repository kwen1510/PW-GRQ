'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

Object.assign(process.env, {
  OPENAI_API_KEY: '',
  MONGO_URI: '',
  MONGO_DB_USERNAME: '',
  MONGO_DB_PASSWORD: '',
  LOCAL_AUTH_BYPASS: 'true',
  NODE_ENV: 'test'
});

const app = require('../server');
let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  if (!server.listening) await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => new Promise((resolve) => server.close(resolve)));

test('public configuration contains no server credentials', async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authRequired, false);
  assert.equal(body.transcriptionModel, 'gpt-transcribe');
  assert.equal(JSON.stringify(body).includes('OPENAI_API_KEY'), false);
  assert.equal(JSON.stringify(body).includes('MONGO_URI'), false);
});

test('health is degraded when OpenAI is intentionally disabled', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.openaiReady, false);
  assert.equal(body.authReady, true);
});

test('analysis validates input before contacting a provider', async () => {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'Review this' })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Prompt and transcript are required');
});

test('transcription rejects missing clips and unknown API routes return JSON', async () => {
  const missing = await fetch(`${baseUrl}/api/transcribe`, { method: 'POST' });
  assert.equal(missing.status, 400);
  const unknown = await fetch(`${baseUrl}/api/not-real`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error, 'API route not found');
});

test('only prompt administrators may change the shared default prompt', async () => {
  const response = await fetch(`${baseUrl}/api/prompts/prompt-id/default`, { method: 'PUT' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'Prompt administrator access required');
});

test('security headers are present', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('password reset page requires and confirms a new password', async () => {
  const response = await fetch(`${baseUrl}/reset-password.html`);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /id="newPassword"/);
  assert.match(page, /id="confirmPassword"/);
  assert.match(page, /id="showPasswords"/);
  assert.match(page, /Change password/);
});
