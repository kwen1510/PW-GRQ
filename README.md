# PW Group Interview Recorder

A resilient, iPad-friendly group interview recorder for RI teachers. Audio is saved to IndexedDB in one-second chunks before it is sent anywhere, then transcribed by OpenAI and optionally analysed with a cost-conscious GPT-5.x model.

## What it does

- Records from a selected browser microphone and shows the device label (including a best-effort Bluetooth hint).
- Rotates recordings into small clips and preserves every completed chunk locally.
- Retries failed uploads using a stable clip ID; the server caches completed transcriptions for 24 hours.
- Stores sessions, transcripts, source audio and analysis reports only in the signed-in teacher's IndexedDB, supports in-browser replay, and never writes these session records to the central database.
- Presents each analysis as a structured, question-by-question report with clearly marked strengths, improvement areas, student feedback, follow-up questions and content areas students could research or include.
- Retains past analyses in local Session history and lets teachers download each report as a readable text file, in addition to the complete session backup and audio ZIP.
- Loads shared analysis prompts from MongoDB, automatically selects the administrator-managed default, labels it `[default]` for teachers, and lets teachers choose any other saved prompt for an individual analysis.
- Shows immediate startup, local-history and prompt-loading feedback during slower authentication or browser-storage work.
- Keeps service readiness, local-backup usage, pending-clip counts and session history current as recordings change, when another tab updates the same browser data, and when the page regains focus.
- Uses OpenAI `gpt-transcribe` for speech-to-text and `gpt-5.6-luna` by default for economical analysis.
- Requires Firebase email/password sign-in in production and accepts only exact addresses in `ALLOWED_TEACHER_EMAILS`. Student-domain accounts and unlisted RI accounts are rejected server-side.
- Lets existing Firebase users request a password-reset email from the sign-in screen without revealing whether an address has an account.

## Local development

Requirements: Node.js 22, MongoDB credentials, and an OpenAI API key.

```bash
cp env.example .env
npm install
npm test
npm run dev
```

Run the deterministic suite and the merged Node/Chromium coverage gate with:

```bash
npm test
npm run test:coverage
```

The coverage command launches a synthetic local browser journey, maps precise Chromium coverage through the production source maps, merges it with explicit all-file Node coverage, writes `coverage/lcov.info` for SonarQube, and fails below 80% lines/statements. Set `CHROME_EXECUTABLE_PATH` when Chrome or Chromium is not installed in a standard macOS location.

Open `http://localhost:3000`. Microphone access works on localhost; a deployed site must use HTTPS.

Useful checks:

```bash
npm run check
npm run audit:frontend
npm run audit:deps
vercel build
```

## Data and recovery model

During recording, each one-second `MediaRecorder` chunk is committed to IndexedDB. Clips rotate every 40 seconds, well below Vercel's request-size limit at the configured 96 kbps bitrate. A clip is marked uploadable only after all its chunks are saved. Upload and transcription happen independently, so a slow API does not pause the next recording clip.

If the page reloads during recording or upload, the clip is recovered into the retry queue. The original audio remains available for retry and download until the teacher explicitly deletes the local session or clears browser storage. Teachers should still download a session backup before clearing Safari/Chrome data.

Completed sessions, transcripts, audio and analysis reports are not persisted to MongoDB or another central repository. They remain scoped to the verified teacher account inside that browser profile. History shows the browser's current storage estimate; capacity varies by device and browser, and audio uses substantially more space than transcript or analysis text.

Local-only retention does not mean offline processing: a selected audio clip is sent to OpenAI for transcription, and the relevant transcript is sent to OpenAI when the teacher requests analysis. The application receives the result and saves it locally. MongoDB contains only shared prompt definitions, default-prompt settings, transient idempotency jobs and aggregate usage quotas—not teacher session content.

## Authentication

Authentication fails closed by default. For trusted loopback development only, set `LOCAL_AUTH_BYPASS=true`; this flag is ignored in production and on Vercel. Local bypass users are not prompt administrators unless `LOCAL_PROMPT_ADMIN=true` is also explicitly set.

For deployment, create a Firebase web app, enable Email/Password sign-in, add the Vercel domain to Firebase Authorized domains, and populate the Firebase and allowlist variables. Create or retain the approved teacher accounts in Firebase Authentication; the app intentionally has no public sign-up flow. The server verifies the signed ID token, password provider, issuer/audience, exact email domain, and exact email allowlist.

Prompt writes and default-prompt changes are additionally restricted to the exact emails in `PROMPT_ADMIN_EMAILS`. All allowed teachers may read prompts and use recording/analysis.

## API

- `GET /api/config` — safe public browser configuration
- `GET /api/health` — provider readiness (never exposes credentials)
- `POST /api/transcribe` — multipart audio plus stable `clipId`
- `POST /api/analyze` — prompt and transcript
- `GET /api/prompts` and `GET /api/prompts/:id` — shared prompt library
- `POST`, `PUT`, `DELETE /api/prompts` — prompt administrators only
- `PUT /api/prompts/:id/default` — set the shared default; prompt administrators only

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel checklist.
