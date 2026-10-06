# Finance tracker overhaul — local implementation

Branch: `feat/finance-overhaul`. No push, deployment, production SQL, live data, credentials, OAuth, or external MCP connection was performed.

## Milestones delivered

1. Ledger integrity: owner checks on financial references (including recurring source), immutable ownership, UPDATE-aware balance triggers, stable locking, runtime parser validation, removal of sensitive logs.
2. Operation layer: session-authenticated narrow API; validated preview/commit; atomic create batches, amend, reverse, undo, recurring posting; idempotency payload checks; expected revisions; append-only audit. Existing manual/AI/quick-add/reverse/recurring posting uses this layer. Direct authenticated transaction writes are removed by migration 005.
3. Monthly review workspace: explicit synthetic `/demo`, monthly navigation, plan versus spending, category filters, review queue/inspection, commitments, split attribution, reflection persistence, error/partial/loading/empty states. No second chatbot in the overview. `/dashboard/reports` uses the same deterministic report function.
4. Import foundation: CSV parser and staging studio, duplicate candidates within file and core comparison against provided ledger fingerprints, reconciliation exceptions, exact installment allocator. These are intentionally not silently committed.
5. Automated TypeScript and real PostgreSQL (PGlite) tests plus GitHub Actions.

## Local use

Node 22+, `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

`npm run dev -- --hostname 127.0.0.1 --port 4317` then `/demo`. No environment credentials needed for demo. The normal authenticated app requires the existing Supabase public URL/anonymous key. No mock credential or fake backend is used. Auth layouts render dynamically, preventing build-time dependency on credentials. System fonts keep builds independent of Google Fonts.

## Migration rollout — not performed

Apply 003, 004, 005 together on a disposable copy first, then review historical exceptions and backup/rollback strategy before production authorization. Existing malformed/cross-owner legacy references require explicit reconciliation; the migration rejects future invalid references but does not invent historical corrections. Deploy the application and SQL as a coordinated change: new writes fail closed if the RPC is unavailable; old clients cannot write directly after 005.

Existing account/wallet opening balances stay NULL. Historical cached balances may already have drifted. The `ledger_account_balances` / `ledger_wallet_balances` views expose a derived balance only with an opening baseline; migration does not label legacy caches reconciled. Newly created accounts/wallets capture their initial opening balance. A production reconciliation/rebuild UI and prevention of legacy direct cache edits remain required before treating account screen caches as authoritative.

`financial_audit` and `financial_requests` have SELECT-only owner RLS; only the definer RPC/trigger writes them. No service-role credential is used. Reverse removes an active row but preserves its full audit snapshot; undo checks the latest audit ID. Request ID reuse with a different payload fails. Callers must preserve request IDs across ambiguous retries; the browser helper retains pending keys during its session, not across reloads.

## API contracts

All routes are `/api/finance/{action}`, authenticate with the existing Supabase cookie session and return `Cache-Control: no-store`. They are not a deployed MCP server or an externally connected assistant integration.

- GET `context`: accounts/categories/wallets, currency/timezone/date.
- GET `search?month=YYYY-MM`: ordered full month, refuses >1,000 rows rather than return partial totals.
- GET `report?month=YYYY-MM`: exact integer-centavo income/spending/personal/recoverable/transfer/net totals.
- GET `audit?id=UUID`: latest 25 owner audit rows.
- POST `preview`: `{request_id, operation}` returns canonical validated operation, SHA-256 digest, `persisted:false`.
- POST `commit`: same payload and `x-finance-preview` digest. This integrity check does not substitute for user consent. DB rechecks owner and revision atomically.
- POST `retro`: `{month, notes}` saves an owner-specific reflection (last writer wins).

Operations: `create {entries}`, `amend {id, expected_revision, entry}`, `reverse {id, expected_revision}`, `undo {id, expected_audit_id}`, `post_recurring {id, expected_next_date, date}`. Entry decimal amounts are strings; IDs are UUIDs; calendar dates are YYYY-MM-DD; report_month is explicit. Transfers require distinct accounts. Card settlements should be transfers to the card account. Full schema is in `lib/finance/contracts.ts` and `core.ts`.

## Honest remaining scope

- No actual backend session or live migration verified; database tests use synthetic local PostgreSQL only.
- No externally authenticated MCP transport, OAuth grant, API token, or connected assistant exists. Existing-cookie endpoints are implemented, not claimed connected.
- BudgetFlow's actual export format was not provided. Studio requires explicit normalized headers and stages only; no automatic account mapping, historical ledger fetch/reconciliation UI, persisted import batches, or import commit workflow yet. Duplicate candidates must be reviewed, including genuinely repeated identical purchases.
- Installment allocation is exact and tested, but saved installment plans/liability tracking and collection/reimbursement matching are not implemented. Upcoming UI shows existing recurring commitments only. Purchase and settlement accounting must be reviewed before enabling installment posting.
- Attribution supports a personal amount within a shared/reimbursable expense; multi-person sub-ledgers/receivable collection are future work. Report totals distinguish allocated shares without presenting them as available cash.
- Investments/net worth intentionally deferred. Legacy account/wallet balance editing still needs replacement by audited reconciliation.
- Dashboard currently supports PHP, complete months up to 1,000 rows, recurring monthly category budgets (no applied rollover engine), and a last-writer-wins reflection. Recurring transfers are rejected until a destination field is implemented.
- Browser visual QA/screenshots are blocked: no browser automation surface was available, and native Chrome acquisition stalled for 71 minutes. No screenshot or visual-success claim is made.

## Design basis

Friendly warm off-white, evergreen accents, readable labels, thin borders and restrained rounded surfaces. Original composition informed by official references supplied by the parent: [Copilot dashboard](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), [Monarch budgeting](https://www.monarch.com/features/budgeting), [Lunch Money](https://lunchmoney.app/features/budgeting/), [Actual interface](https://actualbudget.org/docs/tour/user-interface/). No paid design service installed. Mobbin was not available in callable tools and no access was granted.

## Dependency review

Updated Next.js and matching eslint config from 16.1.4 to 16.3.8 after npm identified critical advisories; applied compatible `npm audit fix` updates. Five high findings remain in the development-only `eslint-config-next → fast-glob → micromatch → braces` chain. npm's suggested forced fix downgrades the framework lint config to 14.2.35; that breaking downgrade was not applied. Do not process untrusted glob patterns through this lint toolchain. Recheck advisories before rollout.

## Verified milestone evidence

- `npm test`: 8/8 passing. PostgreSQL test applies all five migrations to a fresh synthetic PGlite database, exercises owner restrictions/RLS, insert/amend/reverse/undo and idempotency, wallet updates, rollback of a partly invalid batch, derived/cache agreement, atomic recurring posting and end-of-month anchoring.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 16 inherited unused-code warnings, no errors.
- `npm run build`: passed on Next 16.3.8 with Webpack; scripts use Webpack to avoid the local Turbopack subprocess/port sandbox problem. Migrated `middleware.ts` to Next's `proxy.ts` convention.
- Production HTTP smoke: `/demo` 200 (explicit synthetic-data banner); `/demo/import` 200; `/api/finance/context` and `/api/parse-transaction` return 503 `Database not configured` without credentials. These checks are HTTP, not browser visual QA.

## Next implementation milestone

Continue the authorized core scope in a separate reviewable change: persist immutable import batches with per-row include/skip decisions and closing-balance reconciliation, atomic idempotent commit and exception tests; persist installment plans as commitments tied to one purchase expense with payments as transfers; persist reimbursable allocations and collection links with distinct cashflow reporting; replace legacy account/wallet balance editing with audited, revision-checked reconciliation and rebuild. Add end-to-end synthetic integration coverage for those workflows before enabling their UI. No live SQL, external OAuth/MCP setup, credential grant, push or deployment is authorized by this local milestone.
