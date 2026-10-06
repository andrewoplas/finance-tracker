# Native BudgetFlow staging

`scripts/stage-budgetflow.ts` reads the observed native CSV shape with Date, signed Amount, Source/Target Currency, Exchange Rate, Budget Book, Source/Target Account, Folder, Category, Payee, Tags, Notes, and Pending columns. It preserves every source field and source row number, normalizes exact centavos and Manila dates, and produces a source-hash manifest plus staged rows. This is a private dry run, not an application ledger import.

Run using Node 22:

```
node --import tsx scripts/stage-budgetflow.ts /private/source.csv /private/staging YYYY-MM-DD YYYY-MM-DD
```

Both source and output must be outside the public repository. The script resolves real paths, refuses repository paths, creates owner-only output files, and refuses to overwrite an existing source-hash staging result. Do not commit source files or manifests. The original CSV remains authoritative; keep its checksum and immutable copy. Output totals reconcile source rows including unresolved duplicate/zero exceptions, not only clean candidates. Excluded dates are retained separately.

No opening balance, shared attribution, bill date, paid date, or target IDs are invented. Source categories and tags are distinct and preserved. A target account identifies a transfer requiring explicit two-account mapping; ambiguous settlement descriptions are exceptions. Possible duplicates are flagged without deletion. FX, pending rows, zero amounts, unknown timestamp formats, and malformed data require review. Repeated source rows must not silently become duplicate ledger writes.

Before persistence, establish a verified private authenticated destination, map owned accounts/categories, resolve all exceptions, verify monthly/account/category totals, and reconcile statement/opening balances. The existing UI's normalized CSV loader has not been silently changed to auto-import native files. Actual source staging is kept outside Git; only synthetic format tests are committed.


### History only (migration 007)

Apply `007_history_only_import.sql` to the existing public schema; do not rerun
fresh-start SQL. No credentials, grants, or RLS policies change. Create historical
accounts with `opening_balance_unknown: true`; leave `opening_balance` null.
The cache is internal bookkeeping and must never be presented as a verified
balance. API adapters and balance screens show Unknown until reconciliation.

Commit a reviewed batch with `mode: "history_only"`, `closing_balances: []`, and
one explicit decision per source row. This mode requires owned accounts with
unknown baselines, prohibits wallet allocations, preserves source classifications,
and forces `review_status: "pending"`. Original raw source and decisions remain
in the import batch; transaction writes retain revision, audit and idempotency.
Possible duplicates require explicit decisions, and invalid rows cannot commit.
Income/expense reports remain usable; attribution totals remain unreviewed.
Omitting mode retains the strict reconciled import and its statement checks.
Later audited reconciliation supplies a verified baseline without reimporting.
