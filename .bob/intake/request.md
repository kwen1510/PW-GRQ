Can you convert it to vercel, and check the documentation to make sure everything works, and see if there are upgrades required. If you need to use better (and cheap models) in the GPT-5/5.x family, please do so too. I have added the OpenAI API key. Can you swap out the Elevenlabs STT into the OpenAI one (which is a good balance between cheap and accuracy).

Please make sure that you build for stability ad backup of the voice clips. Use indexDB if you need to. No data should be lost and we should be able to retry and get the actual transcription.

Please refactor and clean the whole thing and make sure it has working, safe and secure code.

I want you to scan and improve the UI first, and test all the features and make sure everything is made better and optimised. Make sure no horizontal spilling out of buttons etc. It has to be iPad responsive. One other feature is to check which mic is connected via bluetooth, and how we can click on it.

Maybe sure the SSR and stuff makes sense so the UI is fast and smooth, without compromising security.

Let me know if you need more API keys.

I will also need a very basic authentication on Google Firebase Auth. I will whitelist a list of teachers eventually, but can you whitelist @ri.edu.sg and not @students.ri.edu.sg. See if you can connect using Bob first. But this should be last. Please test that everything else works first.

Then run semgrep and sonarqube and make sure it is a good enough trial-prototype.

---

The 21.8% is not a security score. It means Sonar sees many executable browser lines that our automated journeys exercise, but those browser tests currently do not produce coverage data.

The Node test suite itself reports 53.28%. Sonar falls to 21.8% because most of `src/client/app.js`, `history.js`, authentication UI, and password-reset UI appear as uncovered.

The proper fix is:

- Instrument the Playwright/browser tests and export their JavaScript coverage to LCOV.
- Merge browser coverage with the existing Node LCOV report before Sonar runs.
- Add focused tests for:
  - End-session final-clip processing and retry failures.
  - Authentication, expired sessions and unauthorized users.
  - Password reset: invalid, expired, weak, mismatched and successful cases.
  - Prompt selection and administrator default-prompt changes.
  - History replay, ZIP creation and deletion.
  - OpenAI, MongoDB and Firebase timeout/error handling.
  - Loading, empty and offline states.
- Make coverage include every source file explicitly, so untested files cannot disappear from the denominator.
- Exclude only generated bundles such as `public/assets`, since their original `src/client` modules are already measured.

I would raise the enforced threshold progressively—60%, then 70%, then 80%—while still keeping 80% as the final target. Based on the present codebase, reaching a meaningful 80% likely requires roughly 25–40 additional focused tests plus browser-coverage instrumentation. Simply lowering the Sonar threshold would make it green, but would not improve reliability.

Can you do everything that you have suggested, then launch them?
