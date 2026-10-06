# Finance tracker overhaul — local handoff

Branch: `feat/finance-overhaul`. The first milestone is in commits `674eb71` and `7b67d5f`; this document describes the subsequent workflow milestone as well. No push, deployment, production SQL, real receipts, credentials, OAuth grants, paid services, or external MCP connection were performed.

## Implemented workflows

### Monthly review and corrections

The home screen focuses on monthly spending versus plan, review items, category drilldowns, upcoming recurring/installment commitments, and a saved monthly reflection. `/demo` uses explicit synthetic data. The authenticated dashboard uses the owner's ledger and reporting view. Failures are shown as failures, never zero balances. The Plans workspace retains its last loaded snapshot when refresh fails and labels it stale.

Transaction inspection supports exact amount, description, category, purchase/date, bill date, paid date, report month, attribution, and personal-share corrections, plus revision-checked audit undo/reversal. Linked transactions permit description/category/review changes but protect their financial values. Correct settlements through Plans, or cancel an unpaid allocation/schedule before changing the purchase's financial values.

### CSV import

`/dashboard/import` parses quoted UTF-8 CSV, maps source account names to explicit existing accounts, and maps transfer destinations. Required normalized headers are `date,amount,description,account,type`; dates are YYYY-MM-DD and decimal amounts are positive. The actual BudgetFlow export file was not supplied, so arbitrary/native export-column compatibility is not claimed.

Save a batch before committing. Each saved row retains its source, normalized entry, validation status, and duplicate matches. Invalid/unmapped rows become exceptions and can only be skipped; correct the source and stage a new batch to include them. Duplicate candidates compare date, account, type, amount and normalized description against the ledger and earlier rows in the batch. Identical legitimate purchases require an explicit separate-purchase decision. Every row needs an include/skip decision.

Commit requires a closing statement for every affected source/destination account and a known opening baseline. The database rechecks ownership, current duplicates, and exact closing balances at the supplied date. Any invalid row, new duplicate, missing baseline, or balance mismatch rolls back the entire batch, including audit and idempotency records from attempted sub-operations. Committed batches retain decisions and resulting transaction IDs. Retrying the same request returns the original result; a new request against a committed batch is rejected.

Batches are limited to 100 rows. Opening reconciliation for a historical import should use a statement before the first imported transaction. The importer does not silently infer opening money or adjust a statement to make an import pass.

### Installments

`/dashboard/plans` attaches a saved installment schedule to an already-recorded credit-card expense. It does not create another purchase. The full card liability remains recorded from the original purchase date.

Schedules allocate exact centavos across 1–120 installments, retain month-end anchors, and store separate bill date, due date, report month, total amount and personal amount. Choose either full spending in the purchase's original report month or allocation across billing/report months. A billing plan replaces the purchase only in the reporting view; it never removes or repeats the ledger liability. Personal allocations sum exactly to the purchase's personal share.

Record actual payments, including partial amounts, as transfers from a selected account to the purchase's card. Payments cannot exceed the installment remainder. Remaining liability, paid amount, number of installments and dates are shown separately. Reverse a mistaken payment atomically with its transfer. Cancel only unpaid plans; the confirmation explains that this restores purchase-month reporting. Fees/interest and changing a paid schedule are not modeled automatically; record fees as separate expenses and reverse settlements before replacing a plan.

### Shared and reimbursable expenses

Use transaction inspection to record the personal share of a shared/reimbursable expense. Assign the remaining share to one or more named counterparties in Plans. Total assignments cannot exceed the recoverable share.

Record partial or full collections into a selected account. A collection posts one ledger inflow and reduces the receivable atomically. It is identified separately from earned income in monthly reports. Over-collection, stale revisions and foreign-owner references are rejected. Reversal restores the outstanding amount and reverses the inflow together. Only uncollected allocations can be removed. No uncollected share is presented as available cash.

### Opening balances and reconciliation

New accounts/wallets capture and audit their entered opening baseline. Existing pre-migration baselines remain NULL until explicitly reconciled; historical caches are not assumed correct.

Plans → Match your balances accepts an observed balance, statement/count date, reason, and expected revision. It computes `opening = observed closing − ledger movement through that date`, then rebuilds the current cache including later entries. Both before/after snapshots and the reason are retained. This changes the baseline, not income or spending. Card debt uses a negative balance.

Ordinary account/wallet updates cannot change cached or opening balances. The old wallet add/remove shortcuts are replaced by reconciliation navigation. Account/wallet cache triggers update on insert, update and delete, with owner checks and stable account locking. Metadata and transaction changes advance account/wallet revisions. Accounts with ledger or reconciliation history cannot be deleted to bypass the operation layer; archive them instead. The derived balance views support checking caches against the ledger.

## Reporting semantics

`finance_report_rows` is an owner-isolated, security-invoker view shared by the dashboard and reports API/page. It substitutes installment allocations only for billing-basis plans and marks reimbursement collections separately. It uses exact decimal strings; TypeScript calculations use integer centavos.

Monthly output includes earned income, collections, spending, personal share, allocated-to-others share, transfers and net report amount. Net report amount means earned income plus collections minus report-basis spending. It is not an account balance or paid-date cashflow statement. Transfers/card settlements never become spending. Uncollected receivables are available in the Plans views, not inferred by subtracting this month's collections from this month's expenses.

Currency is PHP, date-only context is Asia/Manila, and report month is explicit. Six-month reports and workspace fetches refuse more than 1,000 rows rather than return incomplete totals. Monthly budgets currently exclude a rollover engine. Monthly reflections use last-writer-wins saving.

## Shared operation contracts

All routes are `/api/finance/{action}`, authenticate with the existing Supabase cookie session and return `Cache-Control: no-store`. These are implemented HTTP contracts, not an externally connected MCP server or OAuth integration.

- GET `context`: accounts/categories/wallets and date/currency/timezone context.
- GET `workspace`: complete bounded account, transaction, import, schedule, settlement and reconciliation data for the current owner.
- GET `search?month=YYYY-MM`: active ledger entries in the original report month.
- GET `report?month=YYYY-MM`: deterministic totals from `finance_report_rows`.
- GET `audit?id=UUID`: latest 25 transaction audit snapshots.
- POST `preview`: `{request_id,operation}` returns canonical validated payload, digest, warnings and `persisted:false`.
- POST `commit`: same payload and `x-finance-preview` digest; the DB revalidates ownership/revisions and commits atomically. The digest is payload integrity, not proof of user consent.
- POST `retro`: `{month,notes}` saves the owner's reflection.

Operations in `lib/finance/contracts.ts`: create, amend, reverse, undo, post_recurring; stage_import, commit_import; create_installments, pay_installment; create_receivable, collect_receivable; reverse_settlement, cancel_plan; reconcile_balance. Decimal amounts are strings; IDs are UUIDs. The private base RPC cannot be called by authenticated clients.

All shared operations serialize per owner and store the request payload/result. Reusing a request ID with a different payload fails. Browser retries retain an operation hash and opaque request ID in session storage, falling back to memory when storage is unavailable; raw financial payloads are not stored there. This covers reloads in the same browser session, not a new device/session. External callers must preserve their request ID and exact payload after ambiguous outcomes.

Audit/request/workflow tables have owner SELECT-only RLS. Only the authenticated definer RPC/ledger triggers write them. Generic transaction mutations are blocked by RLS. Linked settlement transaction markers remain after reversal so generic undo cannot resurrect an unlinked collection/payment.

## Local verification and rollout

Use Node 22+, `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Builds use Webpack because the local Turbopack subprocess/port sandbox path failed. `typecheck` generates Next route types before TypeScript. System fonts avoid build-time Google Fonts access.

Start `npm run dev -- --hostname 127.0.0.1 --port 4317`, then open `/demo`. No environment credentials are needed for the demo. `/demo/import` parses synthetic CSV locally; `/demo/plans` shows a credential-free empty-workspace layout and disables persisted actions. They do not fake a saved backend. The normal app requires the existing Supabase public URL/anonymous key and a real session.

Apply 003–006 together on a disposable database copy first (PostgreSQL 15+ security-invoker views). Review historical cross-owner references and malformed data, reconcile opening balances, and verify Supabase/PostgREST permissions against that copy before production approval. The migrations reject future invalid references but do not invent historical corrections. Coordinate application/SQL rollout: writes fail closed without the RPC; old direct transaction/cache writes are no longer permitted.

Tests use only fresh synthetic PGlite PostgreSQL. They exercise all six migrations, ownership/RLS, revision/idempotency, amount/date/report rules, batch rollback and duplicate changes after staging, partial payments/collections and reversal, reporting without double counting, reconciliation/cache agreement, protection of history, and browser retry keys. This is local database/function integration coverage, not a verified live Supabase connection or browser end-to-end test.

## Remaining limits and approvals

- No live session, production migration, PostgREST integration, deployment, push, new credential, or external MCP/OAuth setup was performed. Those remain separate rollout/setup work requiring authorization.
- Native BudgetFlow export layout remains unverified without a representative synthetic/anonymized file. Category starts uncategorized on import for later review. The UI currently requires normalized headers.
- Investments/net worth, FX/multi-currency, interest amortization, automatic bank synchronization, a paid-date cashflow report, budget rollover, and pagination beyond the bounded workspace are outside this milestone.
- Application visual QA is pending. The in-app browser became available during follow-up verification and rendered `/demo`; interaction/responsive checks have not yet been completed. Native Chrome acquisition previously stalled and is not being retried.
- Next.js and matching lint config were updated from 16.1.4 to 16.3.8, plus compatible security updates. Five high development-only findings remain in the eslint-config-next → fast-glob → micromatch → braces chain. npm's forced suggestion downgrades lint config to 14.2.35; that breaking downgrade was not applied. Recheck advisories before rollout.

## Design basis

Friendly warm off-white, evergreen accents, readable labels, restrained rounded surfaces. Original composition informed by parent-supplied official references: [Copilot dashboard](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview), [Monarch budgeting](https://www.monarch.com/features/budgeting), [Lunch Money](https://lunchmoney.app/features/budgeting/), [Actual interface](https://actualbudget.org/docs/tour/user-interface/). No paid design tool or new MCP grant was installed.

## Final verification for the workflow milestone

- `npm test`: 13 tests passed, including synthetic PostgreSQL application of migrations 001–006, whole-batch rollback, late duplicates, idempotent retry, partial settlements, owner isolation, linked-value protection, exact reporting, opening/reconciliation audits, and blocked direct balance edits/deletion bypass.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 16 inherited unused-code warnings and no errors.
- `npm run build`: passed with Next.js 16.3.8 / Webpack, including `/dashboard/plans` and `/demo/plans`.
- Rebuilt production server HTTP smoke: `/demo`, `/demo/import`, `/demo/plans` returned 200 with expected page content. Unconfigured `/api/finance/workspace`, `/api/finance/preview`, `/api/finance/commit`, and `/api/parse-transaction` returned 503 `Database not configured` using empty requests. No credentials were supplied.
- `git diff --check`: passed. No screenshot/browser-interaction evidence is claimed.

## Budget Flow reference inspection and follow-up verification

The installed Budget Flow macOS application was inspected read-only through supported native app tools. Its Overview and Transactions views were observed directly, including screenshots. No ledger edits were performed. Screenshots contain private financial records and are not repository assets; no private amounts, names, or records are reproduced here.

Observed design patterns:

- Native-looking system sans typography (exact font family unverified), plain bold page titles, quieter secondary metadata.
- Neutral charcoal surfaces in the current dark appearance. A restrained teal action/navigation accent; semantic red/green amounts; category colors confined to small icons and tags. The light appearance was not inspected.
- Fixed sidebar: four primary destinations, with accounts and categories subordinate. A compact month control, search, and overflow actions sit above the page title.
- Overview gives one chart visual priority; alternate charts sit behind a six-page carousel. Supporting content uses simple full-width grouped lists rather than a grid of competing cards.
- Transactions shows two summary values, secondary analysis/planned destinations, then date-grouped rows. Description is primary; account/tag is secondary; time and amount align right. Hairline separators and daily subtotals provide structure.

The user rejected the existing prototype's typography, colors, and density. The next visual pass should remove the slogan hero and competing overview panels; use neutral light surfaces, a system font stack, compact month controls, one summary/chart, a review link/count, and a short grouped activity list. Plans, import, and reflection belong in secondary destinations. This is a proposed simplification, not a claim that the redesign has been implemented. Backend work is preserved.

The authorized BudgetFlow CSV was not found by filename in accessible current-home Documents/Downloads/Desktop searches. The corresponding October 4 task directory was absent; the previously supplied original-home file path remained unreadable after an authorized read-only attempt. No actual export headers or rows were read, so native adapter compatibility and real totals remain unverified. No guessed native-format adapter was added.

Transport audit: the implemented interface is cookie-authenticated REST. There is no MCP JSON-RPC initialize/tools-list/tools-call transport, MCP session lifecycle, or MCP authentication/discovery setup. A future adapter must bind authenticated owner context, expose narrow validated contracts, preserve preview/commit and idempotency semantics, and test protocol/auth failure paths. Existing REST routes alone do not constitute a connected MCP integration. No credentials or grants were created.
