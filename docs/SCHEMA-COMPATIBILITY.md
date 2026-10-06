# Existing project compatibility — local review draft

Do not run `supabase/migrations/001–006` against an existing project with unrelated public wallets/categories/transactions. The application's account model differs from that schema. No table rename, data conversion, existing-user ownership assignment, or public-schema migration is proposed.

## Candidate isolation bundle

`supabase/compatibility/finance-isolated.sql` creates an entirely new `finance` schema in one transaction. It fails if that schema already exists. Generated from the reviewed six migrations by `scripts/build-finance-schema.ts`, it retargets qualified references, search paths, and the balance guard's schema lookup. Public tables, functions, policies, privileges, and existing auth triggers are not changed. No existing users are backfilled into finance profiles and no source records are copied.

All schema/table/sequence/function access for PUBLIC, anon, authenticated, and service_role is revoked at the end of the transaction. Access inherited through those grants is closed; privileged database administrators remain capable of administration. No PostgREST exposed-schema setting is changed. `finance-api-access.sql` is a separate approval-required candidate: authenticated schema usage, owner-filtered reads, explicit limited management writes, and execution of the single finance operation RPC. It gives no direct ledger/audit/request/workflow writes and no helper execution. RLS remains enabled and reporting views retain security-invoker semantics. UPDATE policies explicitly include owner WITH CHECK. New-schema functions receive no default PUBLIC execution after the bundle; future migrations must continue explicit privilege review.

## Signup coexistence and identity

The new bundle deliberately attaches **no trigger to auth.users**. The existing project's signup trigger remains unchanged: signing up may still create Life/Growth/Fun wallets in the old `public.wallets` table. These are separate legacy objects, not new finance ledger wallets. Avoid suggesting that signup has no legacy side effects. Changing or suppressing that old trigger requires a separate reviewed decision; the compatibility bundle must not quietly do it.

After a verified login, the app needs an explicit idempotent profile insert into `finance.profiles` for exactly `auth.getUser().id`, under that user's authenticated RLS session, before category initialization. Do not reuse a test user's ID, assign ownership from user_metadata, or bulk-copy auth users. Display-name metadata is presentation only.

## Smallest setup path (not yet performed)

1. Review the complete actual DDL/privileges and synthetic test results. Apply the isolated bundle first to a disposable copy. Approve production DDL separately.
2. Approve the explicit finance grants and adding only the intended finance API surface to PostgREST's exposed schemas. Check real PostgREST RLS/permissions; SQL-only tests do not establish API availability.
3. Configure this app with the existing project's public URL/publishable-or-anon key only, through an approved local/deployment configuration route. No service-role key. Adapt both SSR and browser clients to `db: {schema: 'finance'}` with no public fallback, and add the own-profile initialization above. These application switches are pending the inventory/plan review, not silently enabled in this draft.
4. Andrew opens the normal `/register` flow and personally enters his email/password, verifies his email, then signs in at `/login`. The agent does not handle passwords. Verify the resulting account UUID and owner-filtered session before staging/importing personal records. If confirmation redirects are needed, inspect the existing allow-list first; changing auth redirect settings requires approval. Registration currently uses the project's existing confirmation behavior.
5. Only then map source account/category IDs, review import exceptions, reconcile source totals and opening/closing statements, and commit through the shared idempotent import operation. Keep raw exports private outside Git.

## Local evidence and limits

The synthetic compatibility test creates conflicting legacy public tables and a legacy signup trigger, snapshots rows plus function/trigger definitions, applies the isolated bundle, and compares the snapshot exactly. It confirms a repeated application fails without changing legacy data; new signups still get only the legacy wallets; finance profiles require explicit own-ID creation; wrong-owner profile insertion is rejected; the private base RPC is inaccessible; the public wrapper commits a synthetic expense; direct ledger deletion is forbidden; another owner sees no report rows. The generated SQL is compared with its checked-in artifact to prevent stale output.

The fixture uses the parent-provided exact table/function/trigger definitions, reported RLS and grants, and synthetic data matching the 9-wallet/14-category/6-transaction counts. Hosted API exposure, provider roles/default ACL implementation, and actual live data are not cloned; this is local compatibility coverage, not live validation. No live migration, grants, exposure setting, credential, signup, or data import occurred. The full reported DDL inventory has been received; a disposable hosted copy and explicit migration/grant/exposure approval remain necessary before deployment.

Official sources reviewed October 6, 2026: [current changelog](https://supabase.com/changelog.md), [custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), and [API security](https://supabase.com/docs/guides/api/securing-your-api). The changelog's latest adapter deprecation concerns `@supabase/server` framework adapters; this app currently uses `@supabase/ssr`, so no auth-library migration was inferred. The provided Supabase skill package could not be opened in this execution environment; parent-supplied mandatory rules were followed and the current official sources were fetched directly.
