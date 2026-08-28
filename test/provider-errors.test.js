'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../src/server/auth');
const { createMongoStore } = require('../src/server/mongo');
const { createOpenAIService } = require('../src/server/openai');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function firebaseConfig(overrides = {}) {
  return {
    authRequired: true,
    localAuthBypass: false,
    localPromptAdmin: false,
    allowedTeacherDomain: 'ri.edu.sg',
    allowedTeacherEmails: ['teacher@ri.edu.sg'],
    promptAdmins: ['teacher@ri.edu.sg'],
    firebase: { projectId: 'synthetic-project' },
    ...overrides
  };
}

test('Firebase middleware distinguishes unavailable, missing, expired and authorised sessions', async () => {
  const unavailable = createAuth(firebaseConfig({ allowedTeacherEmails: [] }));
  let response = responseRecorder();
  await unavailable.requireTeacher({ get: () => '' }, response, () => assert.fail('must not authorise'));
  assert.equal(response.statusCode, 503);

  const payloads = [
    new Error('expired token'),
    { payload: { sub: 'uid-denied', email: 'other@ri.edu.sg', firebase: { sign_in_provider: 'password' } } },
    { payload: { sub: 'uid-ok', email: 'teacher@ri.edu.sg', firebase: { sign_in_provider: 'password' } } }
  ];
  const auth = createAuth(firebaseConfig(), {
    loadVerifier: () => ({ keys: {}, jwtVerify: async () => {
      const result = payloads.shift();
      if (result instanceof Error) throw result;
      return result;
    } })
  });

  response = responseRecorder();
  await auth.requireTeacher({ get: () => '' }, response, () => assert.fail('must require a token'));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Sign in required');

  response = responseRecorder();
  await auth.requireTeacher({ get: () => 'Bearer expired' }, response, () => assert.fail('expired token must fail'));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Session expired or invalid');

  response = responseRecorder();
  await auth.requireTeacher({ get: () => 'Bearer denied' }, response, () => assert.fail('unlisted teacher must fail'));
  assert.equal(response.statusCode, 403);

  const request = { get: () => 'Bearer accepted' };
  let nextCalled = false;
  await auth.requireTeacher(request, responseRecorder(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(request.user, { uid: 'uid-ok', email: 'teacher@ri.edu.sg', promptAdmin: true });
});

test('OpenAI adapter handles unavailable providers and bounds transcription and analysis inputs', async () => {
  const disabled = createOpenAIService({ openaiKey: '', transcriptionModel: 'gpt-transcribe', analysisModel: 'gpt-5.6-luna' });
  await assert.rejects(() => disabled.transcribe({ buffer: Buffer.alloc(1) }), (error) => error.status === 503);
  await assert.rejects(() => disabled.analyze({ prompt: 'p', transcript: 't' }), (error) => error.status === 503);

  const calls = { transcription: null, analysis: null, file: null };
  const client = {
    audio: { transcriptions: { create: async (input) => { calls.transcription = input; return { text: '  transcript  ' }; } } },
    responses: { create: async (input) => { calls.analysis = input; return { output_text: '  analysis  ' }; } }
  };
  const service = createOpenAIService(
    { openaiKey: 'synthetic', transcriptionModel: 'gpt-transcribe', analysisModel: 'gpt-5.6-luna' },
    { client, toFileFn: async (buffer, filename, options) => { calls.file = { buffer, filename, options }; return 'file'; } }
  );
  assert.equal(await service.transcribe({ buffer: Buffer.from('audio'), mimetype: '', filename: '', hints: 'x'.repeat(1200) }), 'transcript');
  assert.equal(calls.file.filename, 'clip.webm');
  assert.equal(calls.file.options.type, 'audio/webm');
  assert.equal(calls.transcription.prompt.length, 1000);

  const names = Array.from({ length: 20 }, (_, index) => `Student ${index}`);
  assert.equal(await service.analyze({ prompt: 'Review', transcript: 'Evidence', question: 'Why?', studentNames: names }), 'analysis');
  const parsed = JSON.parse(calls.analysis.input);
  assert.equal(parsed.context.knownSpeakers.split(', ').length, 12);
  assert.equal(calls.analysis.reasoning.effort, 'none');
  assert.match(calls.analysis.instructions, /untrustedTranscript/);
});

test('Mongo adapter retries failed connections and enforces quota storage outcomes', async () => {
  let connectAttempts = 0;
  const collections = new Map();
  const database = {
    collection(name) {
      if (!collections.has(name)) collections.set(name, { name });
      return collections.get(name);
    }
  };
  class RetryMongoClient {
    async connect() {
      connectAttempts += 1;
      if (connectAttempts === 1) throw new Error('temporary connection failure');
      return { db: () => database };
    }
  }
  const store = createMongoStore({ mongoUri: 'mongodb://synthetic', mongoDbName: 'pw' }, { MongoClientCtor: RetryMongoClient });
  await assert.rejects(() => store.db(), /temporary connection failure/);
  assert.equal(await store.db(), database);
  assert.equal((await store.prompts()).name, 'prompts');

  const quotas = {
    async createIndex() {},
    async findOneAndUpdate() { return { count: 1 }; }
  };
  database.collection = () => quotas;
  assert.equal(await store.consumeDailyQuota('teacher', 'analysis', 5), 1);
  assert.equal(await store.consumeWindowQuota('teacher', 'analysis', 5, 1000), 1);

  quotas.findOneAndUpdate = async () => null;
  await assert.rejects(() => store.consumeDailyQuota('teacher', 'analysis', 5), (error) => error.status === 429);
  quotas.findOneAndUpdate = async () => { const error = new Error('duplicate'); error.code = 11000; throw error; };
  await assert.rejects(() => store.consumeDailyQuota('teacher', 'analysis', 5), (error) => error.status === 429);

  const unavailable = createMongoStore({ mongoUri: '', mongoDbName: 'pw' });
  assert.equal(await unavailable.db(), null);
  assert.equal(await unavailable.prompts(), null);
  await assert.rejects(() => unavailable.consumeDailyQuota('teacher', 'analysis', 5), (error) => error.status === 503);
});
