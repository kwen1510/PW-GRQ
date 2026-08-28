import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import v8ToIstanbul from 'v8-to-istanbul';
import istanbulCoverage from 'istanbul-lib-coverage';

const { createCoverageMap } = istanbulCoverage;

const require = createRequire(import.meta.url);
const root = process.cwd();
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOCAL_AUTH_BYPASS: 'true',
  LOCAL_PROMPT_ADMIN: 'true',
  OPENAI_API_KEY: '',
  MONGO_URI: '',
  MONGO_DB_USERNAME: '',
  MONGO_DB_PASSWORD: ''
});

const app = require('../server.js');
const server = app.listen(0, '127.0.0.1');
if (!server.listening) await once(server, 'listening');
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const chromeCandidates = [
  process.env.CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter(Boolean);
const executablePath = chromeCandidates.find(existsSync);
if (!executablePath) throw new Error('Set CHROME_EXECUTABLE_PATH to a Chromium-compatible browser');

const browserCoverage = createCoverageMap({});
const bundleNames = new Set(['app.js', 'history.js', 'reset-password.js']);

async function mergePageCoverage(entries) {
  for (const entry of entries) {
    let pathname;
    try { pathname = new URL(entry.url).pathname; } catch { continue; }
    const bundleName = path.basename(pathname);
    if (!bundleNames.has(bundleName) || !entry.source) continue;
    const bundlePath = path.join(root, 'public', 'assets', bundleName);
    const converter = v8ToIstanbul(bundlePath, 0, { source: entry.source });
    await converter.load();
    converter.applyCoverage(entry.functions);
    browserCoverage.merge(converter.toIstanbul());
  }
}

async function withCoverage(page, journey) {
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
  try {
    await journey();
  } finally {
    await mergePageCoverage(await page.coverage.stopJSCoverage());
  }
}

function localApiRouter(state) {
  return async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (pathname === '/api/config') {
      return route.fulfill({ json: { authRequired: false, firebase: null, teacherDomain: 'ri.edu.sg', transcriptionModel: 'gpt-transcribe', analysisModel: 'gpt-5.6-luna' } });
    }
    if (pathname === '/api/me') return route.fulfill({ json: { user: { uid: 'local-prototype', email: 'prototype@ri.edu.sg', promptAdmin: true } } });
    if (pathname === '/api/health') {
      if (state.healthFailure) return route.abort('failed');
      return route.fulfill({ json: { status: 'ready', openaiReady: true, mongoReady: true, authReady: true, authRequired: false } });
    }
    if (pathname === '/api/transcribe' && method === 'POST') {
      state.transcriptionAttempts += 1;
      if (state.transcriptionAttempts === 1) return route.fulfill({ status: 503, json: { error: 'Temporary transcription failure', retryable: true } });
      return route.fulfill({ json: { success: true, text: `Synthetic transcript ${state.transcriptionAttempts}` } });
    }
    if (pathname === '/api/analyze' && method === 'POST') {
      if (state.analysisFailure) return route.fulfill({ status: 503, json: { error: 'Temporary analysis failure', retryable: true } });
      return route.fulfill({ json: { success: true, analysis: 'Synthetic evidence-based analysis.' } });
    }
    if (pathname === '/api/prompts' && method === 'GET') {
      if (state.promptFailure) return route.fulfill({ status: 503, json: { error: 'Prompt service unavailable' } });
      return route.fulfill({ json: { prompts: state.prompts.map(({ _id, name }) => ({ _id, name })), defaultPromptId: state.defaultPromptId } });
    }
    if (pathname === '/api/prompts' && method === 'POST') {
      const body = request.postDataJSON();
      const created = { _id: `prompt-${state.prompts.length + 1}`, name: body.name, text: body.text };
      state.prompts.push(created);
      return route.fulfill({ status: 201, json: { success: true, id: created._id, ...created } });
    }
    const defaultMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/default$/);
    if (defaultMatch && method === 'PUT') {
      state.defaultPromptId = decodeURIComponent(defaultMatch[1]);
      return route.fulfill({ json: { success: true, defaultPromptId: state.defaultPromptId } });
    }
    const promptMatch = pathname.match(/^\/api\/prompts\/([^/]+)$/);
    if (promptMatch) {
      const id = decodeURIComponent(promptMatch[1]);
      if (method === 'GET') {
        const prompt = state.prompts.find((item) => item._id === id);
        return prompt ? route.fulfill({ json: prompt }) : route.fulfill({ status: 404, json: { error: 'Prompt not found' } });
      }
      if (method === 'PUT') {
        const prompt = state.prompts.find((item) => item._id === id);
        if (!prompt) return route.fulfill({ status: 404, json: { error: 'Prompt not found' } });
        Object.assign(prompt, request.postDataJSON());
        return route.fulfill({ json: { success: true } });
      }
      if (method === 'DELETE') {
        state.prompts = state.prompts.filter((item) => item._id !== id);
        if (state.defaultPromptId === id) state.defaultPromptId = null;
        return route.fulfill({ json: { success: true } });
      }
    }
    return route.fulfill({ status: 404, json: { error: 'Synthetic route not found' } });
  };
}

async function installBrowserFakes(context) {
  await context.addInitScript(() => {
    const audioBytes = new Uint8Array(1024);
    audioBytes.fill(7);
    class SyntheticMediaRecorder {
      static isTypeSupported(type) { return type.includes('webm'); }
      constructor(stream, options = {}) {
        this.stream = stream;
        this.mimeType = options.mimeType || 'audio/webm';
        this.state = 'inactive';
        this.listeners = new Map();
      }
      addEventListener(name, callback) { this.listeners.set(name, callback); }
      start() { this.state = 'recording'; }
      requestData() { this.ondataavailable?.({ data: new Blob([audioBytes], { type: this.mimeType }) }); }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => this.listeners.get('stop')?.());
      }
    }
    const track = { stop() {}, getSettings: () => ({ sampleRate: 48000, channelCount: 1 }) };
    const mediaDevices = {
      async enumerateDevices() {
        return [
          { kind: 'audioinput', deviceId: 'built-in', label: 'Built-in microphone' },
          { kind: 'audioinput', deviceId: 'bt-mic', label: 'AirPods Pro' }
        ];
      },
      async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; },
      addEventListener() {}
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: async () => true, estimate: async () => ({ usage: 4096, quota: 10 * 1024 * 1024 }) } });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: SyntheticMediaRecorder });
    let objectUrlIndex = 0;
    URL.createObjectURL = () => `blob:synthetic-${objectUrlIndex += 1}`;
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    window.confirm = () => true;
  });
}

async function localApplicationJourney(browser) {
  const state = {
    transcriptionAttempts: 0,
    analysisFailure: false,
    healthFailure: false,
    promptFailure: false,
    defaultPromptId: 'default',
    prompts: [
      { _id: 'default', name: '2025 GRQ Prompt_Final', text: 'Evaluate the evidence carefully.' },
      { _id: 'pirate', name: 'Pirate', text: 'Respond like a careful pirate.' }
    ]
  };
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  await installBrowserFakes(context);
  await context.route(`${baseUrl}/api/**`, localApiRouter(state));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await withCoverage(page, async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#appRoot').waitFor({ state: 'visible' });
    assert.match(await page.locator('#serviceStatus').innerText(), /ready/i);

    await page.locator('#addQuestionButton').click();
    const questions = page.locator('#questionFields textarea');
    await questions.nth(0).fill('How effective is the proposed solution?');
    await questions.nth(1).fill('What evidence supports the recommendation?');
    await page.locator('#questionFields .move-up').nth(1).click();
    await page.locator('#questionFields .move-down').nth(0).click();
    const students = page.locator('#studentFields input');
    await students.nth(0).fill('Jan');
    await students.nth(1).fill('KW');
    await page.locator('#consentCheck').check();

    await page.locator('#microphoneSelect').selectOption('bt-mic');
    await page.locator('#testMicrophoneButton').click();
    await page.getByText(/Connected: AirPods Pro/).waitFor();
    await page.locator('#refreshDevicesButton').click();
    await page.locator('#startSessionButton').click();
    await page.locator('#recordingView').waitFor({ state: 'visible' });
    await page.getByText('Listening…').waitFor();

    await page.getByRole('button', { name: 'KW', exact: true }).click();
    await page.getByText(/transcription failed: Temporary transcription failure/).waitFor();
    await page.locator('#retryButton').click();
    await page.getByText(/Synthetic transcript 2/).waitFor();
    await page.getByRole('button', { name: 'Teacher', exact: true }).click();
    await page.getByText(/Synthetic transcript 3/).waitFor();
    await page.locator('#nextQuestionButton').click();
    await page.getByText('What evidence supports the recommendation?').waitFor();
    await page.getByRole('button', { name: 'Jan', exact: true }).click();
    await page.getByText(/Synthetic transcript 5/).waitFor();
    await page.locator('#endSessionButton').click();
    await page.locator('#completeView').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#reviewTranscript')?.textContent.includes('Synthetic transcript 6'));

    await page.locator('#promptSelect').selectOption('pirate');
    await page.waitForFunction(() => document.querySelector('#analysisPrompt').value.includes('pirate'));
    await page.locator('#runAnalysisButton').click();
    await page.getByText('Synthetic evidence-based analysis.').waitFor();
    state.analysisFailure = true;
    await page.locator('#runAnalysisButton').click();
    await page.getByText('Temporary analysis failure').waitFor();
    state.analysisFailure = false;

    await page.locator('#promptLibraryButton').click();
    await page.locator('#promptDialog').waitFor({ state: 'visible' });
    await page.locator('#promptList').selectOption('pirate');
    await page.waitForFunction(() => document.querySelector('#promptName').value === 'Pirate');
    await page.locator('#setDefaultPromptButton').click();
    await page.waitForFunction(() => [...document.querySelector('#promptList').options].some((option) => option.textContent === '[default] - Pirate'));
    await page.locator('#newPromptButton').click();
    await page.locator('#promptName').fill('Coverage prompt');
    await page.locator('#promptText').fill('Coverage prompt instructions');
    await page.locator('#savePromptButton').click();
    await page.waitForFunction(() => [...document.querySelector('#promptList').options].some((option) => option.textContent === 'Coverage prompt'));
    await page.locator('#deletePromptButton').click();
    await page.waitForFunction(() => ![...document.querySelector('#promptList').options].some((option) => option.textContent === 'Coverage prompt'));
    await page.locator('#promptDialog').evaluate((dialog) => dialog.close());

    await page.locator('#downloadBackupButton').click();
    await page.locator('#downloadAudioButton').click();
    await page.getByText(/Downloaded one ZIP containing/).waitFor();
    await page.locator('#retryCompleteButton').click();
    await page.getByText('There are no pending clips.').waitFor();

    state.promptFailure = true;
    await page.locator('#reloadPromptsButton').click();
    await page.getByText(/Prompts unavailable/).waitFor();
    state.promptFailure = false;
    state.healthFailure = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Server unavailable').waitFor();
    state.healthFailure = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Transcription and analysis ready').waitFor();

    await page.goto(`${baseUrl}/history.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.history-card').waitFor();
    await page.locator('.history-details summary').click();
    await page.waitForFunction(() => [...document.querySelectorAll('audio[data-clip-id]')].every((player) => player.src));
    await page.getByRole('button', { name: 'Download backup' }).click();
    await page.getByRole('button', { name: 'Download audio (.zip)' }).click();
    await page.getByText(/Downloaded one ZIP containing/).waitFor();
    await page.locator('#retryAllButton').click();
    await page.getByText('No pending audio clips.').waitFor();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.locator('#confirmDeleteButton').click();
    await page.getByText('No sessions have been recorded on this device.').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });

  assert.deepEqual(pageErrors, []);
  await context.close();
}

async function authenticationJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  let resetNetworkFailure = false;
  await context.route(`${baseUrl}/api/config`, (route) => route.fulfill({ json: {
    authRequired: true,
    firebase: { apiKey: 'synthetic-key', authDomain: 'synthetic.firebaseapp.com', projectId: 'synthetic', appId: '1:1:web:synthetic' },
    teacherDomain: 'ri.edu.sg'
  } }));
  await context.route('https://identitytoolkit.googleapis.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('sendOobCode')) return resetNetworkFailure ? route.abort('failed') : route.fulfill({ json: { email: 'teacher@ri.edu.sg' } });
    if (url.includes('signInWithPassword')) return route.fulfill({ status: 400, json: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  await withCoverage(page, async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#authGate').waitFor({ state: 'visible' });
    await page.locator('#forgotPasswordButton').click();
    await page.getByText('Enter your RI email address first.').waitFor();
    await page.locator('#signInEmail').fill('Teacher@RI.EDU.SG');
    await page.locator('#forgotPasswordButton').click();
    await page.getByText(/Firebase has sent a password reset email/).waitFor();
    resetNetworkFailure = true;
    await page.locator('#forgotPasswordButton').click();
    await page.getByText(/password reset service could not be reached/i).waitFor();
    await page.locator('#signInPassword').fill('wrong-password');
    await page.locator('#signInButton').click();
    await page.getByText('Email or password is incorrect').waitFor();
  });
  await context.close();
}

async function passwordResetJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  let expiredVerification = false;
  await context.route(`${baseUrl}/api/config`, (route) => route.fulfill({ json: {
    authRequired: true,
    firebase: { apiKey: 'synthetic-key', authDomain: 'synthetic.firebaseapp.com', projectId: 'synthetic', appId: '1:1:web:synthetic' }
  } }));
  let confirmationAttempts = 0;
  await context.route('https://identitytoolkit.googleapis.com/**', (route) => {
    const body = route.request().postDataJSON();
    if (expiredVerification && !body.newPassword) return route.fulfill({ status: 400, json: { error: { message: 'EXPIRED_OOB_CODE' } } });
    if (!body.newPassword) return route.fulfill({ json: { email: 'teacher@ri.edu.sg', requestType: 'PASSWORD_RESET' } });
    confirmationAttempts += 1;
    if (confirmationAttempts === 1) return route.fulfill({ status: 400, json: { error: { message: 'WEAK_PASSWORD : Password should be at least 8 characters' } } });
    return route.fulfill({ json: { email: 'teacher@ri.edu.sg', requestType: 'PASSWORD_RESET' } });
  });
  const page = await context.newPage();
  await withCoverage(page, async () => {
    await page.goto(`${baseUrl}/reset-password.html?mode=resetPassword&oobCode=synthetic-code`, { waitUntil: 'domcontentloaded' });
    await page.locator('#resetForm').waitFor({ state: 'visible' });
    await page.locator('#newPassword').fill('FirstPass123!');
    await page.locator('#confirmPassword').fill('DifferentPass123!');
    await page.locator('#confirmResetButton').click();
    await page.getByText(/passwords do not match/i).waitFor();
    await page.locator('#showPasswords').check();
    await page.locator('#newPassword').fill('MatchingPass123!');
    await page.locator('#confirmPassword').fill('MatchingPass123!');
    await page.locator('#confirmResetButton').click();
    await page.getByText(/password is too weak/i).waitFor();
    await page.locator('#confirmResetButton').click();
    await page.getByText('Your new password is ready').waitFor();
    await page.goto(`${baseUrl}/reset-password.html`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/invalid or has expired/i).waitFor();
    expiredVerification = true;
    await page.goto(`${baseUrl}/reset-password.html?mode=resetPassword&oobCode=expired-code`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/invalid or has expired/i).waitFor();
  });
  await context.close();
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  await localApplicationJourney(browser);
  await authenticationJourney(browser);
  await passwordResetJourney(browser);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const sourceCoverage = createCoverageMap({});
for (const filename of browserCoverage.files()) {
  const normalized = path.resolve(filename);
  if (normalized.startsWith(path.join(root, 'src', 'client') + path.sep)) {
    sourceCoverage.addFileCoverage(browserCoverage.fileCoverageFor(filename));
  }
}
assert(sourceCoverage.files().length > 0, 'Browser coverage did not map back to src/client');
mkdirSync(path.join(root, 'coverage', 'browser'), { recursive: true });
writeFileSync(path.join(root, 'coverage', 'browser', 'coverage-final.json'), JSON.stringify(sourceCoverage.toJSON()));
console.log(JSON.stringify({ browserCoverageFiles: sourceCoverage.files().map((file) => path.relative(root, file)) }, null, 2));
