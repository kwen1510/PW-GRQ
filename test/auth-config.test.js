'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorisedPasswordTeacher, createAuth, exactDomain } = require('../src/server/auth');
const { getConfig } = require('../src/server/config');

test('teacher domain matching is exact and excludes the student subdomain', () => {
  assert.equal(exactDomain('teacher@ri.edu.sg', 'ri.edu.sg'), true);
  assert.equal(exactDomain('TEACHER@RI.EDU.SG', 'ri.edu.sg'), true);
  assert.equal(exactDomain('student@students.ri.edu.sg', 'ri.edu.sg'), false);
  assert.equal(exactDomain('attacker@ri.edu.sg.example.com', 'ri.edu.sg'), false);
  assert.equal(exactDomain('@ri.edu.sg', 'ri.edu.sg'), false);
});

test('password authentication requires the exact teacher allowlist', () => {
  const config = {
    allowedTeacherDomain: 'ri.edu.sg',
    allowedTeacherEmails: ['teacher@ri.edu.sg']
  };
  assert.equal(authorisedPasswordTeacher({ email: 'TEACHER@RI.EDU.SG', email_verified: false, firebase: { sign_in_provider: 'password' } }, config), 'teacher@ri.edu.sg');
  assert.equal(authorisedPasswordTeacher({ email: 'other@ri.edu.sg', firebase: { sign_in_provider: 'password' } }, config), '');
  assert.equal(authorisedPasswordTeacher({ email: 'teacher@ri.edu.sg', firebase: { sign_in_provider: 'google.com' } }, config), '');
  assert.equal(authorisedPasswordTeacher({ email: 'teacher@students.ri.edu.sg', firebase: { sign_in_provider: 'password' } }, config), '');
});

test('MongoDB fallback URI encodes credentials and environment URI wins', () => {
  const fallback = getConfig({ MONGO_DB_USERNAME: 'teacher@example', MONGO_DB_PASSWORD: 'p@ss/word' });
  assert.match(fallback.mongoUri, /teacher%40example:p%40ss%2Fword/);
  const explicit = getConfig({ MONGO_URI: 'mongodb://example.invalid/test' });
  assert.equal(explicit.mongoUri, 'mongodb://example.invalid/test');
});

test('safe model and authorization defaults are explicit', () => {
  const config = getConfig({});
  assert.equal(config.transcriptionModel, 'gpt-transcribe');
  assert.equal(config.analysisModel, 'gpt-5.6-luna');
  assert.equal(config.authRequired, true);
  assert.equal(config.localAuthBypass, false);
  assert.equal(config.allowedTeacherDomain, 'ri.edu.sg');
  assert.deepEqual(config.allowedTeacherEmails, []);
});

test('local authentication bypass is explicit and cannot activate on Vercel', () => {
  assert.equal(getConfig({ LOCAL_AUTH_BYPASS: 'true' }).authRequired, false);
  assert.equal(getConfig({ LOCAL_AUTH_BYPASS: 'true', VERCEL: '1' }).authRequired, true);
  assert.throws(() => getConfig({ LOCAL_AUTH_BYPASS: 'yes' }), /exactly true or false/);
});

test('local bypass never grants prompt administrator implicitly', async () => {
  const auth = createAuth({
    authRequired: false,
    localAuthBypass: true,
    localPromptAdmin: false,
    allowedTeacherDomain: 'ri.edu.sg',
    allowedTeacherEmails: [],
    promptAdmins: [],
    firebase: { projectId: '' }
  });
  const req = {};
  await new Promise((resolve) => auth.requireTeacher(req, {}, resolve));
  assert.equal(req.user.uid, 'local-prototype');
  assert.equal(req.user.promptAdmin, false);
});
