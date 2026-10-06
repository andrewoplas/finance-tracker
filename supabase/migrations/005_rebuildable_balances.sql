begin;
-- Existing cached balances are NOT trustworthy opening balances. Keep null until
-- an owner explicitly reconciles a verified opening balance in a separate rollout.
alter table public.accounts add column opening_balance numeric(12,2);
alter table public.wallets add column opening_balance numeric(12,2);
create or replace function public.capture_opening_balance() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 new.opening_balance := coalesce(new.balance,0);
 return new;
end $$;
create trigger capture_account_opening before insert on public.accounts for each row execute function public.capture_opening_balance();
create trigger capture_wallet_opening before insert on public.wallets for each row execute function public.capture_opening_balance();
create view public.ledger_account_balances with (security_invoker=true) as
select a.id,a.user_id,a.name,a.opening_balance,
 case when a.opening_balance is null then null else a.opening_balance + coalesce((
 select sum(case when t.account_id=a.id then case when t.type='income' then t.amount else -t.amount end else t.amount end)
 from public.transactions t where t.user_id=a.user_id and (t.account_id=a.id or (t.type='transfer' and t.to_account_id=a.id))
 ),0) end as derived_balance,
 a.balance as cached_balance,
 a.opening_balance is not null as opening_verified
from public.accounts a;
create view public.ledger_wallet_balances with (security_invoker=true) as
select w.id,w.user_id,w.name,w.opening_balance,
 case when w.opening_balance is null then null else w.opening_balance+coalesce((select sum(case when t.type='income' then t.amount else -t.amount end)
 from public.transactions t where t.user_id=w.user_id and t.wallet_id=w.id and t.type<>'transfer'),0) end as derived_balance,
 w.balance as cached_balance,w.opening_balance is not null as opening_verified
from public.wallets w;

-- All application transaction mutations now use the audited RPC. Keep SELECT RLS.
drop policy "Users can manage own transactions" on public.transactions;
create policy own_transactions_read on public.transactions for select using(auth.uid()=user_id);

commit;
