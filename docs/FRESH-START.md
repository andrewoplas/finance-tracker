# Fresh start in public — approval-pending plan

Recommendation: use the application's matching `public` schema after the explicitly approved deletion of the three legacy tables. This removes the need for custom-schema API exposure and client switching. The isolated-finance bundle remains an alternative; do not apply both. Nothing in this plan has been run live.

## Scope and dependency gate

Target only project `financial-tracker-brain` (`nbssibquqrkwuyhxzbyg`). Preserve all `auth.users` rows, credentials, sessions, provider settings, and unrelated schemas/objects. Before execution, re-read catalog definitions and compare with the supplied inventory:

- `public.transactions` references `public.wallets`, `public.categories`, and `auth.users`; drop it first.
- `public.wallets` references `auth.users`; `public.categories` has no owner FK.
- `update_transactions_updated_at` and `update_wallets_updated_at` call `public.update_updated_at_column()`; their table drops remove these attached triggers.
- `auth.users.create_wallets_on_signup` calls `public.create_user_wallets()`, whose PL/pgSQL body inserts into the old wallets shape. Remove this specific trigger before dropping tables; otherwise new registrations would execute an obsolete function. Then drop that function with RESTRICT.
- Drop `public.update_updated_at_column()` with RESTRICT only after confirming no other trigger/function depends on it. If shared, retain it; it does not conflict with the new migrations.
- Verify there are no other inbound foreign keys, views/materialized views, rules, triggers, publications, policies, or function/application consumers of these tables. Inspect `pg_depend`, `pg_constraint`, `pg_trigger`, `pg_views`, `pg_matviews`, `pg_publication_tables`, and routine definitions. PL/pgSQL dynamic/text references are not fully captured by catalog dependencies. Stop for any unreviewed dependency; never solve it with broad CASCADE.
- Confirm the remaining names created by migrations 001–006 do not already exist, especially `profiles`, `accounts`, `handle_new_user`, and `auth.users.on_auth_user_created`. Do not silently replace unrelated objects.

## Backup and execution boundary

Before deletion, take a private, owner-readable logical backup of the three tables' definitions/data, constraints/indexes, policies/grants, both legacy functions, and all three trigger definitions. Preserve a schema inventory and relevant default ACLs. Validate restoration in a disposable database. Do not place this backup in Git, Library, or screenshots. Do not assume the Free project has a usable provider backup. No auth-user export or deletion is needed.

Prepare one transactional script, with explicit schema qualification and RESTRICT:

```sql
begin;
-- Set local lock_timeout and statement_timeout to bounded reviewed values.
drop trigger create_wallets_on_signup on auth.users;
drop function public.create_user_wallets() restrict;
drop table public.transactions restrict;
drop table public.wallets restrict;
drop table public.categories restrict;
-- Only if the fresh inventory confirms it is unused:
drop function public.update_updated_at_column() restrict;
-- Insert migrations 001–006 here, in order, under search_path public,pg_catalog.
-- Insert explicit object-scoped privilege hardening and reviewed grants here.
-- Verify expected catalog/ownership assertions before commit.
commit;
```

This is an explanatory skeleton, not an executable reset bundle. Keep the deletion, complete schema creation, and privilege hardening in the same transaction so a migration error restores the old objects/data. Do not commit between migrations. After a successful commit, reversal requires a separately reviewed restore: quiesce writers, preserve any new records first, then restore the validated legacy backup. A SQL ROLLBACK cannot undo an already committed reset.

## New signup and API behavior

Migration 001 installs the new `on_auth_user_created` trigger, which creates a profile; migration 003 hardens its function. The old wallet-creating trigger must stay removed, so new registrations create a new-model profile rather than the legacy Life/Growth/Fun wallets. Existing auth accounts are preserved but will not automatically have profiles. Add idempotent own-profile initialization after verified login, under the authenticated user's RLS identity; do not bulk-assign real data to the existing test accounts.

The public schema has broad reported default grants. At the end of the same transaction, revoke PUBLIC/anon/authenticated/service_role privileges **only on the newly installed application's explicitly enumerated tables, sequences, and functions**, then grant the intended authenticated access: owner-filtered SELECT; limited profile/category/account/wallet/budget/recurring/retro management; EXECUTE only on `commit_financial_operation(uuid,jsonb)`. No direct ledger/audit/request/workflow writes or helper function execution. Include explicit owner WITH CHECK policies and security-invoker report views. Do not use `ALL ... IN SCHEMA public` revocation because unrelated objects may remain. Leave global/default ACL changes out of this minimal scope; future migrations must explicitly close inherited grants.

Public API exposure may already be configured but is not yet verified. Inspect actual PostgREST exposure and test anonymous denial, own-user access, other-owner denial, and RPC access in a disposable hosted copy before live use. Production API grants/configuration still require scoped approval; the deletion confirmation does not implicitly authorize OAuth grants, new credentials, auth-provider changes, or additional exposed schemas. No custom `finance` exposure is needed with this recommendation.

## Required local implementation before an approved live run

Generate the complete explicit reset bundle and object privilege list; test against the exact synthetic legacy fixture, including rollback on unexpected dependent view/FK, preserved auth rows, replaced signup behavior, default-grant cleanup, owner isolation and RPCs. The prior isolated-schema tests are useful evidence but do not validate this new reset path. Configure only the existing public URL and publishable/anon key through the approved route, then Andrew signs in personally. Import remains a separate reviewed step with the existing five staging exceptions and unknown opening balances.
