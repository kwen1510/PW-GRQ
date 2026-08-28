# Prototype quality report

Date: 2026-08-28  
Candidate: 2.2.0

## Passing checks

- `npm test`: 24/24 tests pass, including authorization boundaries, expired/invalid Firebase sessions, strict structured OpenAI output and failure behavior, local analysis export, MongoDB reconnect and quota failures, API behavior, IndexedDB recovery, final-clip handoff, single-ZIP audio export, prompt-administrator denial, recorder rotation and security headers.
- `npm run check`: browser bundles and JavaScript syntax pass.
- `npm run audit:frontend`: no static layout hazards.
- Responsive browser matrix: no page-level horizontal overflow, missing focus treatment or undersized controls at 320×568, 375×812, 512×384, 768×1024, 1024×768 or 1440×900.
- Browser states exercised with synthetic data and a fake microphone: setup, active-speaker “Listening…” state, end-session transcription loading, completed final transcript, automatic default-prompt selection, admin default-prompt mutation, structured question-level analysis, content/research suggestions, individual analysis download, local analysis-history retrieval, history replay controls, single-ZIP audio download and prompt library.
- Immediate startup feedback is present while authentication, IndexedDB recovery and session history load; prompt-library requests also expose a visible busy state instead of an empty wait. The delayed-response browser check passed these states at 320×568, 375×812, 768×1024, 1024×768 and 1440×900 with no horizontal overflow, both locally and against the deployed production assets.
- The status bar refreshes local backup usage and pending clips on local or cross-tab IndexedDB changes, polls visible tabs as a fallback, and refreshes service readiness when connectivity, visibility or focus changes. History also refreshes after same-browser changes and back/forward-cache restoration. A two-tab browser test proved an already-open recorder and History page updated from 1 KB/0 pending/0 sessions to 4 KB/1 pending/1 session without navigation or starting another session; service health also updated on focus, with no 320px or iPad overflow.
- Teachers retain per-analysis prompt choice: the administrator-managed default is preselected and marked `[default]`, while choosing another saved prompt replaces the analysis instructions for that analysis without changing the shared default. A browser test selected a synthetic `Pirate` prompt, confirmed its instructions replaced the default, reloaded the prompt list, and proved `Pirate` remained selected while `[default] - 2025 GRQ Prompt_Final` remained unchanged; keyboard focus and the 320/375/768/1024/1440px matrix also passed.
- Password recovery is available from the sign-in form. A production-asset browser test verified email validation, lowercase normalization, Firebase's `PASSWORD_RESET` request, a non-enumerating success message, restored controls and responsive layout at 320/375/768/1024/1440px. The Firebase endpoint was intercepted, so no real reset email was sent.
- The 2.1.9 custom reset handler asks for and confirms the new password, supports show/hide, preserves the form after a recoverable rejection, labels the retry action clearly and handles expired/invalid links. A mocked Firebase browser test passed the failure-then-retry journey with no horizontal overflow at 320/375/768/1024px.
- Reduced-motion mode disables recording animation.
- `npm audit --omit=dev`: 0 known production dependency vulnerabilities.
- The reproducible Chromium coverage campaign exercises the full local recording journey, failed transcription and retry, final-clip completion, Bluetooth-labelled microphone selection, prompt choice and administration, structured analysis success/failure, content suggestions, local history retrieval and per-analysis download, history replay/deletion, loading/empty/offline states, Firebase login/reset network errors, and invalid/expired/weak/mismatched/successful reset states. The analysis and history views pass at 320×568, 375×812, 768×1024, 1024×768 and 1440×900 with no horizontal overflow or undersized visible controls. Precise V8 coverage is source-map remapped from esbuild bundles to all nine `src/client` modules and merged with explicit all-file Node coverage.
- Merged coverage enforces an 80% line and statement threshold and reports 90.47% lines/statements. Sonar's combined line-and-condition calculation reports 88.0% and passes its unchanged 80% quality gate.
- Semgrep Community scan ran 218 rules across 103 release targets with 0 findings. It excludes generated esbuild bundles whose original modules remain scanned, plus local credentials, dependencies and coverage output.
- Gitleaks current-tree scan: 0 leaks, with local credential files and generated dependencies explicitly excluded.
- OSV Scanner and Trivy: 0 known production dependency vulnerabilities in `package-lock.json`.
- `vercel build --yes`: successful with the pinned Node.js 22.x runtime.
- Instrumented merged coverage: 90.47% statements/lines, 69.90% branches and 50.34% functions. Function coverage is distorted downward by esbuild/V8 source-map function boundaries, so the enforced release threshold and Sonar gate use executable lines and conditions.

## SonarQube status

The final 2026-08-28 SonarQube Community Build analysis for clean revision `780ca528cf5f586c8003903d0d7f42b4d8d17302` completed successfully. It reported 0 open issues, 0 bugs, 0 vulnerabilities, 0 code smells, 0 security hotspots and 0.0% duplicated lines across 2,668 lines of code.

The quality gate passes. Sonar reports 88.0% coverage against the unchanged 80% requirement. The browser journey is instrumented rather than inferred, generated bundles are excluded while their source modules remain measured, and every application JavaScript source file is present in the merged denominator.

The repository workflow accepts a supplied `SONAR_TOKEN`, or can use `SONAR_ADMIN_PASSWORD` to create and revoke a short-lived token. This run used the existing project scanner token from macOS Keychain. The scanner uploaded the analysis successfully; because the token cannot access the administrator-only hotspot listing API, the fail-closed verifier used Sonar's project `security_hotspots` measure and confirmed it was zero. No Sonar credential is stored in the project.

## Release status

The 2.2.0 candidate is deployed to `https://pw-grq-zeta.vercel.app` as immutable deployment `dpl_ALPfsCqQMHbbJMvnA3gLrG8waHT8`. The live health endpoint reports OpenAI, MongoDB, Firebase and authentication ready. Production denies unauthenticated identity and prompt access, serves the 2.2.0 structured-analysis and local-history assets, and passes the password-login layout at 320×568, 375×812, 768×1024, 1024×768 and 1440×900 without horizontal overflow or undersized visible buttons. One separate synthetic provider call verified that `gpt-5.6-luna` returns the strict report schema and five suggested content areas; it contained no teacher or student data.

The exact `2025 GRQ Prompt_Final` shared prompt was updated and verified as the default. It now asks for evidence-grounded strengths, gaps, stakeholder and feasibility considerations, missing content/research directions, individual feedback, follow-up questions and evidence limitations. MongoDB continues to store prompt configuration, quotas and transient retry metadata only; completed sessions, audio, transcripts and analyses remain in the verified teacher's IndexedDB and are not written to a central session repository.

Firebase currently rejects both email-template and action-URL saves with “Email template updates are currently unavailable for this project.” Consequently, the custom reset handler is implemented and tested but Firebase-generated emails will continue to use Firebase's default sender, wording and hosted reset page until a project owner or Firebase Support enables template updates and sets the action URL to `https://pw-grq-zeta.vercel.app/reset-password.html`. No live template change is claimed.

A real allowlisted teacher sign-in and physical Bluetooth microphone recording remain human-device checks. Formal Bob certification remains blocked by the outstanding signed owner review and stale canonical Bob evidence for the current working tree; this does not invalidate the completed technical checks above.

## Live agentic and UI assurance

- Thirteen bounded production probes passed: anonymous and malformed-token denial; unlisted RI teacher denial; exact student-subdomain denial; prompt read/create/update/delete denial; analysis and hidden-route denial; hostile-origin mutation denial; path-traversal denial; and required security headers.
- Two disposable Firebase password identities were created for the denial checks and both were deleted immediately.
- Live login UI passed at 320×568, 375×812, 512×384 (200% zoom equivalent), 768×1024, 1024×768 and 1440×900 with no overflow, clipped controls, undersized visible buttons, browser errors or reduced-motion violations.
- The authenticated local journey passed setup, two pre-session questions, selectable fake microphone enumeration, recording, speaker switching, retryable failed transcription, completion, prompt-library and history states. OpenAI calls were intercepted, so this test incurred no provider cost.
