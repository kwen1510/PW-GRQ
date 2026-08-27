# pw-grq agentic QA and adversarial testing

Status: **technically assessed; formal Bob stage not certified**

Target: production deployment `dpl_4bywrY41dWgoBJziibKXxj15sn9k` and matching local 2.1.2 browser bundle.

The complementary deterministic SonarQube Community Build run passed its quality gate with no open issues or security hotspots. Its sanitized local evidence is stored at `.bob/local/sonarqube.json`.

## Bounded production probes

Thirteen checks passed using anonymous requests, malformed bearer tokens and two disposable Firebase password identities:

- unlisted `@ri.edu.sg` and `@students.ri.edu.sg` identities were denied with 403;
- direct prompt read/create/update/delete, analysis and hidden API paths were denied before resource access;
- an unauthenticated hostile-origin mutation was denied with 401 and received no CORS allow-origin header;
- encoded path traversal did not expose server source;
- production security headers were present and error responses contained no stack, provider credential or connection-string detail.

Both disposable Firebase identities were deleted immediately after the probes. No transcript, prompt, audio or analysis record was created.

## Experience exploration

- Live login layouts passed phone, 200%-zoom-equivalent, iPad portrait/landscape and desktop viewports.
- An authenticated local fake-microphone journey covered entering two questions before the session, microphone enumeration/connection, recording, speaker switching, completion, prompt library and history.
- Intercepted transcription failure left two locally persisted clips visibly retryable. AI endpoints were intercepted to avoid provider cost and hosted data mutation.
- Automated geometry found no page overflow, clipped control or visible button below 44×44 CSS pixels. Visual inspection found clear hierarchy, consistent spacing and usable mobile/iPad layouts.

## Residual human checks

- Sign in with one real allowlisted teacher account.
- Confirm a physical Bluetooth microphone label and audio quality on the intended iPad/browser.
- Review one real, consented transcription and analysis for classroom fitness.
