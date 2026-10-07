# Tags and source plans

Apply `20261007035014_tags_and_planned_items.sql` after migration 007. No reset.
The deployment tolerates unavailable new tables and reports unavailable sections
until the reviewed migration is applied. The parent remains the live DB writer.

`transactions.tag_ids` captures tag membership inside existing transaction audit
snapshots, revisions and undo. A trigger validates same-owner references and
maintains normalized `transaction_tags`; clients cannot write that join directly.
Composite owner foreign keys protect even privileged backfills. Tags have scoped
read/create access; only the existing audited transaction RPC changes membership.
Omitting tag_ids on amend preserves tags; sending [] explicitly clears them.
Metadata-only changes no longer churn balance caches or account revisions.

Private restoration resolves source row -> committed batch decision -> transaction
ID from the original import results. It never matches merely by amount/date.
It rejects changed provenance or conflicting manual tags, captures an idempotency
receipt, and compares complete ledger financial content and account snapshots
before/after. Backfill data is outside this repository. Test fixtures are synthetic.

`planned_items` are read-only source references for signed-in owners. They have
no posting path, ledger link or report contribution. Source date labels retain
unknown years; confirmed_date, cadence and remaining_count remain null unless
separately verified. Category hints record icon-based inference; tag names preserve
the screenshot. Account screenshot balances are reference evidence only, not
opening balances or reconciliations. No automated recurring entry is activated.
