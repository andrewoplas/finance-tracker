# Project instructions

## Commit and push by default

- After completing each requested change and running the relevant checks, commit and push it to the current branch's configured upstream without asking for confirmation again. This is the default for this project unless the user explicitly requests otherwise (for example, read-only work or no commit/push).
- Treat a change as a coherent, completed unit of work, not each individual file edit. If required checks fail, resolve them before committing and pushing; report any blocker honestly.
- Stage only files and hunks belonging to the requested work. Preserve unrelated local changes and never include them merely to clean the working tree.
- Follow the repository's commit convention: prefix commit subjects with `[Drew]`.
- Use a normal push. Never force-push, rewrite published history, or discard work to make a push succeed. If the remote has advanced, reconcile safely and rerun relevant checks; ask for guidance if conflicts or scope are unclear.
- Report the commit and push result when finished. A push does not by itself verify deployment.

## Implementation

- Inspect the relevant request path and architecture before implementing. Keep queries, fields, processing, and payloads narrowly scoped to what the task needs.
- Ask for guidance before implementing when the intended architecture or a meaningful performance tradeoff is unclear.
