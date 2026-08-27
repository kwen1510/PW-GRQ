# Bob project start

1. Read ../AGENTS.md, .bob/project.json and .bob/workflow/definition.json before changing code.
2. Resume from .bob/workflow/state.json when it exists; never infer a checkpoint from chat history.
3. Keep local, staging and production evidence separate.
4. Resolve applicable reusable blocks, scanner lessons and test impact before implementation.
5. Never weaken authentication, authorization, database policy, tests or scanners to pass.
6. Use synthetic data locally. Credentials, hosted mutation and production require their explicit gates.
7. Update canonical JSON, append-only history and revision-bound evidence after accepted work; generated Markdown is only a view.
