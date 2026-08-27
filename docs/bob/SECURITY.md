# pw-grq security

Status: **technical checks completed; formal Bob certification pending**

- Authentication: Firebase email/password ID tokens verified server-side against issuer, audience and Google JWKS.
- Authorization: exact teacher email allowlist plus exact `ri.edu.sg` domain; `students.ri.edu.sg` is denied; prompt mutation requires the separate administrator allowlist.
- Data boundary: recordings and sessions are owner-partitioned in browser IndexedDB. MongoDB stores shared prompts, quotas and idempotent transcription-job state. Provider credentials remain server-only.
- Reliability: finalized contiguous audio chunks are reconstructed and retried; incomplete/non-contiguous clips are quarantined instead of submitted.
- Scanners: npm audit, OSV, Trivy and Gitleaks report zero findings. SonarQube Community Build passed its quality gate with zero bugs, vulnerabilities, security hotspots, code smells and open issues. Semgrep reports one cookie-CSRF heuristic, adjudicated not applicable to explicit bearer-token authentication and validated with a hostile-origin production request.
- Adversarial production checks: 13/13 passed; temporary Firebase identities deleted.
- Coverage accountability: 54.47% statements/lines, 69.38% branches and 59.25% functions. Critical configuration, authorization, IndexedDB recovery and API validation paths have deterministic tests; provider-success and shared-prompt mutation paths rely on remaining integration/UAT coverage.
- Pending human checks: real allowlisted teacher sign-in, physical Bluetooth microphone UAT and signed Bob owner review.
