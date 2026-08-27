'use strict';

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { getConfig } = require('./src/server/config');
const { createAuth } = require('./src/server/auth');
const { createMongoStore } = require('./src/server/mongo');
const { createOpenAIService } = require('./src/server/openai');

const config = getConfig();
const mongo = createMongoStore(config);
const auth = createAuth(config);
const ai = createOpenAIService(config);
// Protected mutations use explicit bearer tokens, not ambient cookies.
const app = express(); // nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.set('x-request-id', req.requestId);
  next();
});
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://*.googleapis.com', 'https://securetoken.googleapis.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '256kb', strict: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: config.nodeEnv === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store');
  }
}));

const publicLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const commonLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  keyGenerator: (req) => req.user.uid,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const transcriptionLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, keyGenerator: (req) => req.user.uid, standardHeaders: 'draft-8', legacyHeaders: false });
const analysisLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, keyGenerator: (req) => req.user.uid, standardHeaders: 'draft-8', legacyHeaders: false });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter: (_req, file, callback) => callback(null, /^audio\//i.test(file.mimetype))
});

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function acquireTranscriptionJob(jobs, { jobKey, leaseId, contentHash }) {
  const now = new Date();
  try {
    await jobs.insertOne({
      key: jobKey,
      leaseId,
      contentHash,
      status: 'processing',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    return {};
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const existing = await jobs.findOne({ key: jobKey });
  if (existing?.contentHash && existing.contentHash !== contentHash) {
    throw Object.assign(new Error('This clip ID belongs to different audio'), { status: 409, retryable: false });
  }
  if (existing?.status === 'complete') return { cachedText: existing.text };

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const takeover = await jobs.updateOne(
    { key: jobKey, status: { $ne: 'complete' }, $or: [{ status: { $ne: 'processing' } }, { updatedAt: { $lte: staleBefore } }] },
    { $set: { status: 'processing', leaseId, contentHash, updatedAt: now, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
  );
  if (!takeover.modifiedCount) {
    throw Object.assign(new Error('This clip is already being transcribed'), { status: 409, retryable: true, retryAfter: 3 });
  }
  return {};
}

function publicFirebaseConfig() {
  const f = config.firebase;
  if (!(f.apiKey && f.authDomain && f.projectId && f.appId)) return null;
  return { apiKey: f.apiKey, authDomain: f.authDomain, projectId: f.projectId, appId: f.appId };
}

app.get('/api/config', publicLimit, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    authRequired: config.authRequired,
    firebase: publicFirebaseConfig(),
    teacherDomain: config.allowedTeacherDomain,
    transcriptionModel: config.transcriptionModel,
    analysisModel: config.analysisModel
  });
});

app.get('/api/health', publicLimit, async (_req, res) => {
  let mongoReady = false;
  try {
    const database = await mongo.db();
    if (database) {
      await database.command({ ping: 1 });
      mongoReady = true;
    }
  } catch {
    mongoReady = false;
  }
  const authReady = !config.authRequired || auth.firebaseReady;
  const ready = ai.configured && mongoReady && authReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    openaiReady: ai.configured,
    mongoReady,
    authReady,
    authRequired: config.authRequired
  });
});

app.use('/api', async (req, _res, next) => {
  if (config.localAuthBypass) return next();
  try {
    await mongo.consumeWindowQuota(`ip:${req.ip}`, 'authentication', 120, 15 * 60 * 1000);
    next();
  } catch (error) { next(error); }
});
app.use('/api', auth.requireTeacher);
app.use('/api', commonLimit);

app.get('/api/me', (req, res) => res.json({ user: req.user }));

app.post('/api/transcribe', transcriptionLimit, upload.single('audio'), async (req, res, next) => {
  const clipId = cleanText(req.body?.clipId, 100);
  if (!req.file || !clipId) return res.status(400).json({ error: 'An audio clip and clipId are required' });
  if (req.file.size < 512) return res.status(422).json({ error: 'The audio clip is too short to transcribe' });

  let jobs = null;
  const jobKey = `${req.user.uid}:${clipId}`;
  const hints = cleanText(req.body?.hints, 1000);
  const mediaIdentity = `${String(req.file.mimetype || '').toLowerCase()}|${path.extname(req.file.originalname || '').toLowerCase()}`;
  const contentHash = crypto.createHash('sha256').update(req.file.buffer).update('\0').update(mediaIdentity).update('\0').update(hints).update('\0').update(config.transcriptionModel).digest('hex');
  const leaseId = crypto.randomUUID();
  try {
    const database = await mongo.db();
    if (!database) return res.status(503).json({ error: 'Transcription recovery storage is unavailable', retryable: true });
    jobs = database.collection('transcription_jobs');
    await jobs.createIndex({ key: 1 }, { unique: true });
    await jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const acquisition = await acquireTranscriptionJob(jobs, { jobKey, leaseId, contentHash });
    if (Object.hasOwn(acquisition, 'cachedText')) {
      return res.json({ success: true, text: acquisition.cachedText, cached: true, clipId });
    }

    await mongo.consumeDailyQuota(req.user.uid, 'transcription', 200);
    await mongo.consumeDailyQuota('global', 'transcription', 1000);
    await mongo.consumeWindowQuota(req.user.uid, 'transcription', 20, 10 * 60 * 1000);

    const heartbeat = setInterval(() => {
      jobs.updateOne({ key: jobKey, leaseId, status: 'processing' }, { $set: { updatedAt: new Date() } }).catch(() => {});
    }, 30_000);
    heartbeat.unref?.();
    const text = await ai.transcribe({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      hints
    }).finally(() => clearInterval(heartbeat));
    if (jobs) await jobs.updateOne({ key: jobKey, leaseId }, { $set: { status: 'complete', text, updatedAt: new Date() } });
    return res.json({ success: true, text, cached: false, clipId });
  } catch (error) {
    if (jobs) await jobs.updateOne({ key: jobKey, leaseId }, { $set: { status: 'failed', updatedAt: new Date() } }).catch(() => {});
    return next(error);
  }
});

app.post('/api/analyze', analysisLimit, async (req, res, next) => {
  const prompt = cleanText(req.body?.prompt, 20_000);
  const transcript = cleanText(req.body?.transcript || req.body?.conversation, 120_000);
  if (!prompt || !transcript) return res.status(400).json({ error: 'Prompt and transcript are required' });
  try {
    await mongo.consumeDailyQuota(req.user.uid, 'analysis', 50);
    await mongo.consumeDailyQuota('global', 'analysis', 250);
    await mongo.consumeWindowQuota(req.user.uid, 'analysis', 10, 10 * 60 * 1000);
    const analysis = await ai.analyze({
      prompt,
      transcript,
      question: cleanText(req.body?.question, 2000),
      studentNames: Array.isArray(req.body?.studentNames) ? req.body.studentNames.map((name) => cleanText(name, 100)) : []
    });
    return res.json({ success: true, analysis, model: config.analysisModel, timestamp: new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/prompts', async (_req, res, next) => {
  try {
    const collection = await mongo.prompts();
    if (!collection) return res.json({ prompts: [] });
    const database = await mongo.db();
    const [prompts, setting] = await Promise.all([
      collection.find({}, { projection: { text: 0 } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      database.collection('app_settings').findOne({ key: 'default-prompt' })
    ]);
    const serialized = prompts.map((prompt) => ({ ...prompt, _id: String(prompt._id) }));
    const defaultPromptId = serialized.some((prompt) => prompt._id === String(setting?.promptId)) ? String(setting.promptId) : null;
    return res.json({ prompts: serialized, defaultPromptId });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/prompts/:id', async (req, res, next) => {
  try {
    const collection = await mongo.prompts();
    if (!collection) return res.status(503).json({ error: 'Prompt storage is unavailable' });
    const prompt = await collection.findOne({ _id: mongo.id(req.params.id) });
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
    return res.json({ ...prompt, _id: String(prompt._id) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/prompts', auth.requirePromptAdmin, async (req, res, next) => {
  const name = cleanText(req.body?.name, 120);
  const text = cleanText(req.body?.text, 20_000);
  if (!name || !text) return res.status(400).json({ error: 'Prompt name and text are required' });
  try {
    const collection = await mongo.prompts();
    if (!collection) return res.status(503).json({ error: 'Prompt storage is unavailable' });
    const now = new Date().toISOString();
    const result = await collection.insertOne({ name, text, createdAt: now, updatedAt: now, updatedBy: req.user.email });
    return res.status(201).json({ success: true, id: String(result.insertedId), name, text, createdAt: now, updatedAt: now });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/prompts/:id', auth.requirePromptAdmin, async (req, res, next) => {
  const name = cleanText(req.body?.name, 120);
  const text = cleanText(req.body?.text, 20_000);
  if (!name || !text) return res.status(400).json({ error: 'Prompt name and text are required' });
  try {
    const collection = await mongo.prompts();
    if (!collection) return res.status(503).json({ error: 'Prompt storage is unavailable' });
    const updatedAt = new Date().toISOString();
    const result = await collection.updateOne({ _id: mongo.id(req.params.id) }, { $set: { name, text, updatedAt, updatedBy: req.user.email } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Prompt not found' });
    return res.json({ success: true, updatedAt });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/prompts/:id/default', auth.requirePromptAdmin, async (req, res, next) => {
  try {
    const database = await mongo.db();
    if (!database) return res.status(503).json({ error: 'Prompt storage is unavailable' });
    const prompt = await database.collection('prompts').findOne({ _id: mongo.id(req.params.id) }, { projection: { _id: 1, name: 1 } });
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
    const updatedAt = new Date().toISOString();
    await database.collection('app_settings').updateOne(
      { key: 'default-prompt' },
      { $set: { promptId: prompt._id, promptName: prompt.name, updatedAt, updatedBy: req.user.email } },
      { upsert: true }
    );
    return res.json({ success: true, defaultPromptId: String(prompt._id), updatedAt });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/prompts/:id', auth.requirePromptAdmin, async (req, res, next) => {
  try {
    const database = await mongo.db();
    const collection = database?.collection('prompts');
    if (!collection) return res.status(503).json({ error: 'Prompt storage is unavailable' });
    const result = await collection.deleteOne({ _id: mongo.id(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Prompt not found' });
    await database.collection('app_settings').deleteOne({ key: 'default-prompt', promptId: mongo.id(req.params.id) });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500));
  if (status >= 500) console.error('Request failed:', error.message);
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  res.status(status).json({
    error: status >= 500 ? 'The request could not be completed' : error.message,
    retryable: error.retryable ?? (status === 409 || status === 429 || status >= 500)
  });
});

if (require.main === module) {
  app.listen(config.port, '127.0.0.1', () => console.log(`PW GRQ running at http://127.0.0.1:${config.port}`));
}

module.exports = app;
