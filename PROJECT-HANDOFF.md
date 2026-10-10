# Finance Tracker project handoff

Verified 2026-10-11 (Asia/Manila).

Publishing update (2026-10-11): following Drew's request to commit and push, local `main` incorporated GitHub commit `1914928` through a history-preserving merge. Its ChatGPT Actions implementation and learned-default instructions are now in the checkout. The consolidation findings and verification below describe the earlier `ccf454b` snapshot; they do not certify the merged code. Cash-default commit `b7b8cc7` remains unrecovered, and remote MCP activation and pending expenses remain unconfirmed. No migrations or explicit deployment actions were performed.

## Workspace consolidation

Canonical workspace: `/Users/drew/Documents/vibe-coding/finance-tracker`.
Repository: [andrewoplas/finance-tracker](https://github.com/andrewoplas/finance-tracker).

The requested source, `/Users/drew/Documents/Codex/2026-10-06/task/finance-tracker`, is absent (including no symlink). Its parent still exists. The destination already contains the application, `.git`, `.github`, `.agents`, ignored/generated files, and the project research and planning notes. No source files were available to copy or compare. This is consistent with an earlier move, but does not establish completeness against the former source or recover any changes that existed only there.

The initial tracked/untracked working tree was clean, with no stashes and one registered worktree at the canonical path. Existing files were retained; nothing was overwritten, deleted, reset, rebased, or merged. No file conflicts were encountered because there was no second source tree to merge. Existing project notes include `AI_TRANSACTION_PLAN.md`, `BUG_HUNT_CHECKLIST.md`, `DESIGN_PLAN.md`, `ERROR_LOGGING_RESEARCH.md`, `MOBILE_UI_RESEARCH.md`, `UX_IMPROVEMENTS_RESEARCH.md`, `WORK_DONE_SUMMARY.md`, and `docs/`.

Adjacent artifacts remain in their original locations, outside the repository:

- Private imports, SQL reviews, reconciliation files, verification scripts and screenshots: `/Users/drew/Documents/Codex/2026-10-06/task/finance-private`.
- Synthetic QA screenshots: `/Users/drew/Documents/Codex/2026-10-06/task/finance-qa`.
- Empty reference directory: `/Users/drew/Documents/Codex/2026-10-06/task/budgetflow-private-reference`.

These sibling folders were not part of the named source and were left untouched. In particular, `docs/OVERHAUL.md` uses an old `../finance-qa/` relative path; use the absolute screenshot location above from this workspace. Do not import private source data into Git while repairing those references.

## Git state and recovered remote history

| Ref | Verified commit | Status |
| --- | --- | --- |
| Local `main` / current checkout | `ccf454be24fb105160454d899d86d470821b792b` | Existing checkout retained |
| `origin/main` | `19149280dcc21f47f81a01a8c3ac80536dabe4e7` | Fetched; one commit ahead of local `main` |
| Local and remote `feat/remote-expense-mcp` | `b378b484b21d69f1e928bff4be6a1beef2a9d8e6` | Fetched and preserved as a local tracking branch; seven commits ahead of local `main` |

The existing `feat/finance-overhaul` and `feat/history-only-import` branches were preserved. The remote URL remains `https://github.com/andrewoplas/finance-tracker.git`. Only the two named remote refs were fetched, without tags. Local `main`, its index and application files were not updated. No new commit was created.

GitHub [PR #1](https://github.com/andrewoplas/finance-tracker/pull/1) is **OPEN / DRAFT**, titled “Add expense-only OAuth MCP in disabled review preview”, from `feat/remote-expense-mcp` into `main`.

The remote MCP guide is present on that branch, rather than the current `main` checkout:

- [Branch guide: docs/REMOTE-MCP.md](https://github.com/andrewoplas/finance-tracker/blob/b378b484b21d69f1e928bff4be6a1beef2a9d8e6/docs/REMOTE-MCP.md)
- Read locally without switching branches: `git show feat/remote-expense-mcp:docs/REMOTE-MCP.md`.

The fetched `origin/main` commit `1914928` adds ChatGPT Actions expense logging with learned defaults and `docs/CHATGPT.md`. This is a separate path from the draft remote OAuth MCP. It has not been integrated into this checkout. Neither fetching code nor reading historical validation establishes deployment or connection status.

## Current behavior and unresolved work

**User-specified rule:** new expenses default to **Cash** unless another account is specified. Drew reports that cloud commit `b7b8cc7` implemented this and was not pushed. That object is absent from the local object database, including after fetching current GitHub main and the MCP branch. Its content has not been recovered or verified.

There is a concrete behavior gap to resolve before calling the Cash default implemented here:

- The current local quick-log instructions require an explicit owned account and say there is no default account.
- The fetched remote MCP guide likewise requires `account_id` and explicit account selection.
- The newer fetched main describes learned account choices, or the only active owned account; its instructions explicitly prohibit inventing Cash. That commit is not evidence of the missing unconditional Cash-default change.

Keep explicit-account overrides when recovering/reconciling the cloud change. Do not silently replace missing cloud work with the learned-default implementation or revise financial behavior as part of this folder consolidation.

**MCP connection and activation remain pending.** The draft branch contains `/api/mcp/expenses` with `expense_context`, `expense_preview`, and `expense_commit`. Its `lib/mcp/remote/config.ts` has `activationApproved = false`; environment values alone cannot enable it. Its SQL is a review-only proposal in `supabase/proposals/remote_expense_mcp.sql`. OAuth setup, database restrictions, grants, configuration, deployment and end-to-end activation require separate work and authorization. The existing `docs/MCP.md` describes the separate localhost/session adapter.

**Pending chat expenses have not been confirmed in the live app.** No pending expenses were submitted, imported, or used as test data in this task. The draft guide refers to eight pending Cash entries, but their details/count were not independently reconciled here. Only a verified persisted result with a transaction ID and matching app record can establish that a requested expense was saved; inspect existing records/receipts before retrying to avoid duplicates.

## Verification for this handoff

Verification applies to retained local `main` at `ccf454b`, not to the unmerged remote branches or a deployed app:

- `git fsck --full`: passed.
- Five non-database TypeScript test files (`finance`, `client`, `date-label`, `monthly-navigation`, `budgetflow-native`): **15 tests passed**, using synthetic data and injected HTTP responses.
- `python3 -B tests/quick-log-client.test.py`: **3 tests passed**, with injected HTTP responses.
- `./node_modules/.bin/tsc --noEmit --incremental false`: passed, using existing generated Next.js types.
- `npm run lint`: passed with **0 errors / 11 existing unused-code warnings**.
- Preservation check: SHA-256 comparison of all existing repository file contents outside `.git`, including hidden and ignored files, plus symlink targets; the handoff is the only intended added workspace file.

The full `npm test` suite was deliberately not run because several tests execute SQL migrations in disposable PGlite databases. No migrations, build, dev server, live API/database operation, push, deployment, merge, credential setup, or activation was performed. Historical testing/deployment statements in branch documentation were not rerun or independently verified here.

## Next steps

1. Recover cloud commit `b7b8cc7` from its original cloud workspace as a Git bundle or patch, including any uncommitted changes and notes. Inspect its actual diff and parent before integrating it; keep a separate preserved copy/ref if it conflicts.
2. Review `main..origin/main` and `main..feat/remote-expense-mcp`, then choose the integration order for newer main, the draft MCP work, and the recovered Cash default. The two fetched branches have separate work; do not overwrite either path or assume they are already combined.
3. Verify Cash resolution against the owner's active accounts and explicit-account overrides on the chosen combined implementation, including missing/ambiguous Cash handling and idempotent retries.
4. Continue the activation checklist in the branch's `docs/REMOTE-MCP.md` only under separate authorization. Confirm the exact target database and code before any migration; do not apply the repository's migration backlog wholesale.
5. Reconcile pending chat expenses with live app records/receipts through an authorized workflow, then save only genuinely missing, authorized entries. Record confirmed transaction IDs.
6. Keep the canonical workspace path for future work. If the old source is restored or found in a backup, compare it including hidden files, Git objects/refs, ignored files and dirty changes before copying; preserve conflicting versions separately.
