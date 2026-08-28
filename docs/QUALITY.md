# Prototype quality report

Date: 2026-08-28  
Candidate: 2.1.10

## Passing checks

- `npm test`: 22/22 tests pass, including authorization boundaries, expired/invalid Firebase sessions, OpenAI payload and failure behavior, MongoDB reconnect and quota failures, API behavior, IndexedDB recovery, final-clip handoff, single-ZIP audio export, prompt-administrator denial, recorder rotation and security headers.
- `npm run check`: browser bundles and JavaScript syntax pass.
- `npm run audit:frontend`: no static layout hazards.
- Responsive browser matrix: no page-level horizontal overflow, missing focus treatment or undersized controls at 320×568, 375×812, 512×384, 768×1024, 1024×768 or 1440×900.
- Browser states exercised with synthetic data and a fake microphone: setup, active-speaker “Listening…” state, end-session transcription loading, completed final transcript, automatic default-prompt selection, admin default-prompt mutation, history replay controls, single-ZIP audio download and prompt library.
- Immediate startup feedback is present while authentication, IndexedDB recovery and session history load; prompt-library requests also expose a visible busy state instead of an empty wait. The delayed-response browser check passed these states at 320×568, 375×812, 768×1024, 1024×768 and 1440×900 with no horizontal overflow, both locally and against the deployed production assets.
- The status bar refreshes local backup usage and pending clips on local or cross-tab IndexedDB changes, polls visible tabs as a fallback, and refreshes service readiness when connectivity, visibility or focus changes. History also refreshes after same-browser changes and back/forward-cache restoration. A two-tab browser test proved an already-open recorder and History page updated from 1 KB/0 pending/0 sessions to 4 KB/1 pending/1 session without navigation or starting another session; service health also updated on focus, with no 320px or iPad overflow.
- Teachers retain per-analysis prompt choice: the administrator-managed default is preselected and marked `[default]`, while choosing another saved prompt replaces the analysis instructions for that analysis without changing the shared default. A browser test selected a synthetic `Pirate` prompt, confirmed its instructions replaced the default, reloaded the prompt list, and proved `Pirate` remained selected while `[default] - 2025 GRQ Prompt_Final` remained unchanged; keyboard focus and the 320/375/768/1024/1440px matrix also passed.
- Password recovery is available from the sign-in form. A production-asset browser test verified email validation, lowercase normalization, Firebase's `PASSWORD_RESET` request, a non-enumerating success message, restored controls and responsive layout at 320/375/768/1024/1440px. The Firebase endpoint was intercepted, so no real reset email was sent.
- The 2.1.9 custom reset handler asks for and confirms the new password, supports show/hide, preserves the form after a recoverable rejection, labels the retry action clearly and handles expired/invalid links. A mocked Firebase browser test passed the failure-then-retry journey with no horizontal overflow at 320/375/768/1024px.
- Reduced-motion mode disables recording animation.
- `npm audit --omit=dev`: 0 known production dependency vulnerabilities.
- The reproducible Chromium coverage campaign exercises the full local recording journey, failed transcription and retry, final-clip completion, Bluetooth-labelled microphone selection, prompt choice and administration, analysis success/failure, history replay/download/deletion, loading/empty/offline states, Firebase login/reset network errors, and invalid/expired/weak/mismatched/successful reset states. Precise V8 coverage is source-map remapped from esbuild bundles to all eight `src/client` modules and merged with explicit all-file Node coverage.
- Merged coverage enforces an 80% line and statement threshold and reports 88.49% lines/statements. Sonar's combined line-and-condition calculation reports 86.1% and passes its 80% quality gate.
- Semgrep 2.1.10 repository-hook scan ran 221 rules across 595 targets with 0 findings. It covers generated Bob evidence and reviewed source while excluding generated esbuild bundles whose original modules remain scanned; local credentials, dependencies and coverage output are also excluded.
- Gitleaks current-tree scan: 0 leaks, with local credential files and generated dependencies explicitly excluded.
- OSV Scanner and Trivy: 0 known production dependency vulnerabilities in `package-lock.json`.
- `vercel build --yes`: successful with the pinned Node.js 22.x runtime.
- Instrumented merged coverage: 88.49% statements/lines, 69.87% branches and 49.35% functions. Function coverage is distorted downward by esbuild/V8 source-map function boundaries, so the enforced release threshold and Sonar gate use executable lines and conditions.

## SonarQube status

The final 2026-08-28 SonarQube Community Build analysis completed successfully. It reported 0 open issues, 0 bugs, 0 vulnerabilities, 0 code smells, 0 security hotspots and 0.0% duplicated lines across 2,389 lines of code.

The quality gate passes. Sonar reports 86.1% coverage against the unchanged 80% requirement. The browser journey is instrumented rather than inferred, generated bundles are excluded while their source modules remain measured, and every application JavaScript source file is present in the merged denominator.

The repository workflow accepts a supplied `SONAR_TOKEN`, or can use `SONAR_ADMIN_PASSWORD` to create and revoke a short-lived token. This run used a project-scoped temporary token. The scanner uploaded the analysis successfully; its optional administrator-only hotspot API follow-up returned HTTP 403, so the authenticated local dashboard was used to verify 0 issues and 0 hotspots. The token was revoked immediately afterward and its temporary local file was removed; neither the token nor administrator password is stored in the project.

## Release status

The previous 2.1.9 candidate remains deployed at `https://pw-grq-zeta.vercel.app` as immutable deployment `dpl_6aH1CbNgf7RDXGvH36xKpbnTjm1e`. The 2.1.10 immutable deployment identity and production checks will replace this paragraph after release.

Firebase currently rejects both email-template and action-URL saves with “Email template updates are currently unavailable for this project.” Consequently, the custom reset handler is implemented and tested but Firebase-generated emails will continue to use Firebase's default sender, wording and hosted reset page until a project owner or Firebase Support enables template updates and sets the action URL to `https://pw-grq-zeta.vercel.app/reset-password.html`. No live template change is claimed.

A real allowlisted teacher sign-in and physical Bluetooth microphone recording remain human-device checks. Formal Bob certification remains blocked by the outstanding signed owner review and stale canonical Bob evidence for the current working tree; this does not invalidate the completed technical checks above.

## Live agentic and UI assurance

- Thirteen bounded production probes passed: anonymous and malformed-token denial; unlisted RI teacher denial; exact student-subdomain denial; prompt read/create/update/delete denial; analysis and hidden-route denial; hostile-origin mutation denial; path-traversal denial; and required security headers.
- Two disposable Firebase password identities were created for the denial checks and both were deleted immediately.
- Live login UI passed at 320×568, 375×812, 512×384 (200% zoom equivalent), 768×1024, 1024×768 and 1440×900 with no overflow, clipped controls, undersized visible buttons, browser errors or reduced-motion violations.
- The authenticated local journey passed setup, two pre-session questions, selectable fake microphone enumeration, recording, speaker switching, retryable failed transcription, completion, prompt-library and history states. OpenAI calls were intercepted, so this test incurred no provider cost.
