'use strict';

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('Boolean environment values must be exactly true or false');
}

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function getConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const localAuthBypass = bool(env.LOCAL_AUTH_BYPASS, false) && nodeEnv !== 'production' && !env.VERCEL;
  const username = env.MONGO_DB_USERNAME || '';
  const password = env.MONGO_DB_PASSWORD || '';
  const fallbackMongoUri = username && password
    ? `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@cluster0.bwtbeur.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
    : '';

  return {
    port: Number(env.PORT || 3000),
    nodeEnv,
    openaiKey: env.OPENAI_API_KEY || '',
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe',
    analysisModel: env.OPENAI_ANALYSIS_MODEL || 'gpt-5.6-luna',
    mongoUri: env.MONGO_URI || fallbackMongoUri,
    mongoDbName: env.MONGO_DB_NAME || 'pw_grq',
    authRequired: !localAuthBypass,
    localAuthBypass,
    localPromptAdmin: localAuthBypass && bool(env.LOCAL_PROMPT_ADMIN, false),
    allowedTeacherDomain: (env.ALLOWED_TEACHER_DOMAIN || 'ri.edu.sg').toLowerCase(),
    allowedTeacherEmails: csv(env.ALLOWED_TEACHER_EMAILS),
    promptAdmins: csv(env.PROMPT_ADMIN_EMAILS),
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID || '',
      apiKey: env.FIREBASE_WEB_API_KEY || '',
      authDomain: env.FIREBASE_AUTH_DOMAIN || '',
      appId: env.FIREBASE_APP_ID || ''
    }
  };
}

module.exports = { bool, csv, getConfig };
