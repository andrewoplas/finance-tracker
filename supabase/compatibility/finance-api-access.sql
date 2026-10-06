-- SEPARATE APPROVAL REQUIRED. Local test draft, not applied.
-- This does NOT add finance to PostgREST's exposed schemas.
begin;
grant usage on schema finance to authenticated;
grant select on all tables in schema finance to authenticated;
grant insert, update on finance.profiles to authenticated;
grant insert, update, delete on finance.categories, finance.budgets,
 finance.recurring_transactions, finance.retro_plans to authenticated;
grant insert, update, delete on finance.accounts, finance.wallets to authenticated;
-- Ledger, audit, requests and workflow rows are SELECT-only; writes go through this one RPC.
grant execute on function finance.commit_financial_operation(uuid,jsonb) to authenticated;
-- No anon/service_role grants, no helper execution grants, no direct transaction writes.
commit;
