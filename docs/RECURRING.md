# Automatic recurring transactions

Active schedules post when their next date/time arrives in Asia/Manila. A missing time means midnight. Supabase Cron runs `process_due_recurring()` every minute, independently of browser sessions and Vercel. Pausing a schedule stops posting. Resuming catches up missed dates, retaining their original reporting month. Each invocation processes at most 100 occurrences.

`semimonthly` means the 1st and 15th. Monthly/yearly schedules retain their original day anchor through shorter months. `next_time` is a Manila wall-clock time; it is retained each cycle.

Automatic posting and the manual Process Now action share a private database function and the existing per-owner financial lock. Process Now only posts due occurrences. Each schedule/date pair has a permanent receipt; reversing a payment does not make cron recreate it. An exact existing payment (owner, account, type, date, amount, normalized description) is reused. This does not identify differently named bank notifications or prevent a user from independently adding a new regular expense after automatic posting.

Transaction insertion, normal balance/audit triggers, occurrence receipt, and schedule advancement commit atomically. A failure rolls back the batch and appears in cron run history; the next minute retries. No application role can invoke the worker or private posting primitive directly.

## Operations

Apply `20261012010000_automatic_recurring.sql` before `20261012020000_recurring_cron.sql`. The latter requires hosted PostgreSQL with pg_cron; the posting logic is tested separately with PGlite. Inspect `cron.job` for `finance-recurring-posting` and `cron.job_run_details` for successful runs. To pause automation globally, use `cron.alter_job(jobid, active := false)` for that named job; do not delete receipts.

The October 2026 BudgetFlow restoration starts from the supplied October/November next dates, without historical backfill. Contribution and Langga repeat on the 1st/15th; the other eight repeat monthly. Ecoflow has no supplied final installment date and continues until paused or deleted.
