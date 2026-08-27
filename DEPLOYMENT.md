# Vercel deployment

## Required environment variables

Add these in Vercel for Production, Preview, and Development as appropriate:

```env
OPENAI_API_KEY=...
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=pw_grq

ALLOWED_TEACHER_DOMAIN=ri.edu.sg
ALLOWED_TEACHER_EMAILS=teacher.one@ri.edu.sg,teacher.two@ri.edu.sg
PROMPT_ADMIN_EMAILS=teacher.one@ri.edu.sg,teacher.two@ri.edu.sg

FIREBASE_PROJECT_ID=...
FIREBASE_WEB_API_KEY=...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_APP_ID=...
```

Optional model overrides:

```env
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
OPENAI_ANALYSIS_MODEL=gpt-5.6-luna
```

Do not deploy `.env`, OpenAI keys, MongoDB passwords, or Firebase service-account private keys. The server verifies Firebase ID tokens against Google's public signing keys and does not need a service-account key for this prototype.

Authentication is always required on Vercel. `LOCAL_AUTH_BYPASS` is deliberately ignored there.

## Firebase setup

1. Create/select a Firebase project and web app.
2. Enable Authentication → Sign-in method → Email/Password. Do not add a public sign-up flow.
3. Confirm the approved teacher accounts already exist under Authentication → Users, or create them there with temporary passwords delivered privately.
4. Add every final and preview hostname that will be used to Authentication → Settings → Authorized domains.
5. Configure the variables above.
6. Confirm that a listed teacher succeeds and an unlisted or `@students.ri.edu.sg` account receives HTTP 403.

## Build and deploy

```bash
npm ci
npm test
npm run check
npm audit --omit=dev
vercel build
vercel deploy
```

Promote to production only after the preview passes:

```bash
vercel --prod
```

## Post-deployment checks

- `/api/health` reports `status: ready`, `mongoReady: true`, and `authRequired: true`.
- Unauthenticated calls to protected `/api/*` endpoints return 401.
- Listed teacher email/password sign-in works; unlisted and student-subdomain accounts are rejected.
- A short synthetic/consented recording transcribes, survives a reload, retries with the same clip ID, and can be downloaded.
- Prompt read and GPT analysis work; prompt mutation is limited to configured admins.
- Phone and iPad portrait/landscape pages have no horizontal overflow.

Vercel Functions accept limited request bodies, so the browser rotates small audio clips instead of sending a full interview at once. Local source audio remains in IndexedDB for recovery.
