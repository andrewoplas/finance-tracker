# Native BudgetFlow staging

`scripts/stage-budgetflow.ts` reads the observed native CSV shape with Date, signed Amount, Source/Target Currency, Exchange Rate, Budget Book, Source/Target Account, Folder, Category, Payee, Tags, Notes, and Pending columns. It preserves every source field and source row number, normalizes exact centavos and Manila dates, and produces a source-hash manifest plus staged rows. This is a private dry run, not an application ledger import.

Run using Node 22:

```
node --import tsx scripts/stage-budgetflow.ts /private/source.csv /private/staging YYYY-MM-DD YYYY-MM-DD
```

Both source and output must be outside the public repository. The script resolves real paths, refuses repository paths, creates owner-only output files, and refuses to overwrite an existing source-hash staging result. Do not commit source files or manifests. The original CSV remains authoritative; keep its checksum and immutable copy. Output totals reconcile source rows including unresolved duplicate/zero exceptions, not only clean candidates. Excluded dates are retained separately.

No opening balance, shared attribution, bill date, paid date, or target IDs are invented. Source categories and tags are distinct and preserved. A target account identifies a transfer requiring explicit two-account mapping; ambiguous settlement descriptions are exceptions. Possible duplicates are flagged without deletion. FX, pending rows, zero amounts, unknown timestamp formats, and malformed data require review. Repeated source rows must not silently become duplicate ledger writes.

Before persistence, establish a verified private authenticated destination, map owned accounts/categories, resolve all exceptions, verify monthly/account/category totals, and reconcile statement/opening balances. The existing UI's normalized CSV loader has not been silently changed to auto-import native files. Actual source staging is kept outside Git; only synthetic format tests are committed.
