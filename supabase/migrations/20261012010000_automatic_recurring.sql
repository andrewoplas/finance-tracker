begin;
alter table public.recurring_transactions drop constraint recurring_transactions_frequency_check;
alter table public.recurring_transactions add constraint recurring_transactions_frequency_check check(frequency in ('daily','weekly','monthly','yearly','semimonthly'));
-- NULL means no source time was supplied; the job posts at midnight Manila.
alter table public.recurring_transactions add column next_time time;
create index recurring_due_idx on public.recurring_transactions(next_date) where is_active;
create index recurring_duplicate_lookup_idx on public.transactions(user_id,account_id,date,amount);
-- Keep receipts after a transaction is reversed, so retries cannot recreate it.
create table public.recurring_occurrences (
 recurring_id uuid not null references public.recurring_transactions(id) on delete cascade,
 scheduled_date date not null,
 user_id uuid not null references public.profiles(id),
 transaction_id uuid not null,
 matched_existing boolean not null,
 created_at timestamptz not null default now(),
 primary key(recurring_id,scheduled_date)
);
alter table public.recurring_occurrences enable row level security;
create policy own_recurring_occurrences on public.recurring_occurrences for select using(auth.uid()=user_id);
revoke all on public.recurring_occurrences from public,anon,authenticated,service_role;
grant select on public.recurring_occurrences to authenticated;

create function public.advance_recurring_date(d date, frequency text, anchor integer) returns date
language sql immutable set search_path=public,pg_temp as $$
 select case frequency
 when 'daily' then d+1
 when 'weekly' then d+7
 when 'semimonthly' then case when extract(day from d)<15 then date_trunc('month',d)::date+14 else (date_trunc('month',d)+interval '1 month')::date end
 else (date_trunc('month',d)+case when frequency='yearly' then interval '1 year' else interval '1 month' end)::date
   + least(coalesce(anchor,extract(day from d)::integer),extract(day from date_trunc('month',d)+case when frequency='yearly' then interval '13 months' else interval '2 months' end-interval '1 day')::integer)-1 end
$$;

-- Private primitive shared by the authenticated manual operation and cron.
-- The owner lock matches every existing financial write; take it before row locks.
create function public.post_recurring_occurrence(actor uuid, schedule_id uuid, expected_date date, as_of timestamp) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.recurring_transactions; receipt public.recurring_occurrences; txn public.transactions;
begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into r from public.recurring_transactions where id=schedule_id and user_id=actor for update;
 if not found then raise exception 'Schedule unavailable'; end if;
 select * into receipt from public.recurring_occurrences where recurring_id=r.id and scheduled_date=expected_date;
 if found then
  select * into txn from public.transactions where id=receipt.transaction_id and user_id=actor;
  if found then return to_jsonb(txn); end if;
  return jsonb_build_object('already_processed',true,'id',receipt.transaction_id);
 end if;
 if not r.is_active or r.next_date is distinct from expected_date then raise exception 'Schedule conflict' using errcode='40001'; end if;
 if r.next_date+coalesce(r.next_time,time '00:00')>as_of then raise exception 'Occurrence is not due'; end if;
 if r.type='transfer' then raise exception 'Recurring transfers require destination mapping'; end if;
 if r.type='expense' and r.category_id is null then raise exception 'Choose a category for this expense'; end if;
 if not exists(select 1 from public.accounts where id=r.account_id and user_id=actor and not is_archived) then raise exception 'Account unavailable'; end if;
 -- An imported or manually logged payment for this exact occurrence takes precedence.
 select * into txn from public.transactions t where t.user_id=actor and t.account_id=r.account_id
  and t.date=r.next_date and t.amount=r.amount and t.type=r.type
  and lower(trim(coalesce(t.description,'')))=lower(trim(coalesce(r.description,'')))
  order by t.id limit 1;
 if found then
  insert into public.recurring_occurrences values(r.id,r.next_date,actor,txn.id,true,now());
 else
  insert into public.transactions(user_id,account_id,category_id,type,amount,description,date,time,report_month,is_recurring,recurring_id)
  values(actor,r.account_id,r.category_id,r.type,r.amount,r.description,r.next_date,r.next_time,to_char(r.next_date,'YYYY-MM'),true,r.id) returning * into txn;
  insert into public.recurring_occurrences values(r.id,r.next_date,actor,txn.id,false,now());
 end if;
 update public.recurring_transactions set next_date=public.advance_recurring_date(r.next_date,r.frequency,r.anchor_day),
 anchor_day=coalesce(r.anchor_day,extract(day from r.next_date)::integer) where id=r.id;
 return to_jsonb(txn);
end $$;
revoke all on function public.post_recurring_occurrence(uuid,uuid,date,timestamp) from public,anon,authenticated,service_role;

-- A bounded catch-up batch; missed occurrences retain their scheduled date/month.
create function public.process_due_recurring() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0; as_of timestamp:=(now() at time zone 'Asia/Manila'); due date;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('finance-recurring-worker',0)) then return 0; end if;
 for r in select id,user_id from public.recurring_transactions where is_active and next_date<=as_of::date order by user_id,id limit 100 loop
  perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
  loop
   select next_date into due from public.recurring_transactions where id=r.id and is_active and next_date+coalesce(next_time,time '00:00')<=as_of;
   exit when not found or n>=100;
   perform public.post_recurring_occurrence(r.user_id,r.id,due,as_of);
   n:=n+1;
  end loop;
  exit when n>=100;
 end loop;
 return n;
end $$;
revoke all on function public.process_due_recurring() from public,anon,authenticated,service_role;

create or replace function public.commit_financial_operation_base(request_id uuid, operation jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 actor uuid := auth.uid(); previous public.financial_requests; current_row public.transactions;
 result_row public.transactions; entry jsonb; result jsonb := '[]'; kind text := operation->>'action';
 audit_row public.financial_audit; recurring public.recurring_transactions; next_day date; month_start date;
begin
 if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
 -- Serialize per owner so retries and overlapping batches cannot race.
 perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
 select * into previous from public.financial_requests r where r.user_id = actor and r.request_id = commit_financial_operation_base.request_id;
 if found then
   if previous.payload <> operation then raise exception 'Idempotency key reused with different payload'; end if;
   return previous.result;
 end if;
 if kind = 'create' then
   if jsonb_typeof(operation->'entries') <> 'array' or jsonb_array_length(operation->'entries') not between 1 and 100 then raise exception 'Invalid batch'; end if;
   for entry in select value from jsonb_array_elements(operation->'entries') loop
     if entry->>'time' is not null and entry->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' then raise exception 'Invalid transaction time'; end if;
     if entry->>'type' = 'expense' and entry->>'category_id' is null then raise exception 'Choose a category for this expense'; end if;
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     insert into public.transactions(user_id,account_id,category_id,wallet_id,type,amount,description,date,time,to_account_id,bill_date,paid_date,report_month,attribution,personal_amount,review_status,tag_ids)
     values(actor,(entry->>'account_id')::uuid,(entry->>'category_id')::uuid,(entry->>'wallet_id')::uuid,entry->>'type',(entry->>'amount')::numeric,
       entry->>'description',(entry->>'date')::date,(entry->>'time')::time,(entry->>'to_account_id')::uuid,(entry->>'bill_date')::date,(entry->>'paid_date')::date,
       entry->>'report_month',coalesce(entry->>'attribution','personal'),coalesce((entry->>'personal_amount')::numeric,0),coalesce(entry->>'review_status','pending'),array(select jsonb_array_elements_text(coalesce(entry->'tag_ids','[]'))::uuid)) returning * into result_row;
     result := result || jsonb_build_array(to_jsonb(result_row));
   end loop;
 elsif kind = 'post_recurring' then
   result:=public.post_recurring_occurrence(actor,(operation->>'id')::uuid,(operation->>'expected_next_date')::date,(now() at time zone 'Asia/Manila'));
 elsif kind in ('amend','reverse') then
   select * into current_row from public.transactions where id = (operation->>'id')::uuid and user_id = actor for update;
   if not found then raise exception 'Transaction unavailable'; end if;
   if (operation->>'expected_revision') is null or current_row.revision <> (operation->>'expected_revision')::integer then raise exception 'Revision conflict' using errcode = '40001'; end if;
   if kind = 'reverse' then
     delete from public.transactions where id = current_row.id;
     result := jsonb_build_object('reversed',current_row.id);
   else
     entry := operation->'entry';
     if entry->>'time' is not null and entry->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' then raise exception 'Invalid transaction time'; end if;
     if entry->>'type' = 'expense' and entry->>'category_id' is null then raise exception 'Choose a category for this expense'; end if;
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     update public.transactions set account_id=(entry->>'account_id')::uuid, category_id=(entry->>'category_id')::uuid,
       wallet_id=(entry->>'wallet_id')::uuid,type=entry->>'type',amount=(entry->>'amount')::numeric,description=entry->>'description',
       date=(entry->>'date')::date,time=case when entry ? 'time' then (entry->>'time')::time else current_row.time end,to_account_id=(entry->>'to_account_id')::uuid,bill_date=(entry->>'bill_date')::date,paid_date=(entry->>'paid_date')::date,
       report_month=entry->>'report_month',attribution=entry->>'attribution',personal_amount=(entry->>'personal_amount')::numeric,review_status=entry->>'review_status',
       tag_ids=case when entry ? 'tag_ids' then array(select jsonb_array_elements_text(entry->'tag_ids')::uuid) else current_row.tag_ids end
       where id=current_row.id returning * into result_row;
     result := to_jsonb(result_row);
   end if;
 elsif kind = 'undo' then
   select * into audit_row from public.financial_audit where user_id=actor and transaction_id=(operation->>'id')::uuid order by id desc limit 1;
   if not found or (operation->>'expected_audit_id') is null or audit_row.id::text <> operation->>'expected_audit_id' then raise exception 'Audit conflict' using errcode='40001'; end if;
   if audit_row.before_row is null then
     delete from public.transactions where id=audit_row.transaction_id and user_id=actor;
   elsif audit_row.after_row is null then
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     result_row.revision := result_row.revision + 1;
     insert into public.transactions select (result_row).*;
   else
     result_row := jsonb_populate_record(null::public.transactions,audit_row.before_row);
     update public.transactions set account_id=result_row.account_id, category_id=result_row.category_id,
       wallet_id=result_row.wallet_id,type=result_row.type,amount=result_row.amount,description=result_row.description,
       date=result_row.date,time=result_row.time,to_account_id=result_row.to_account_id,bill_date=result_row.bill_date,paid_date=result_row.paid_date,
       report_month=result_row.report_month,attribution=result_row.attribution,personal_amount=result_row.personal_amount,review_status=result_row.review_status,tag_ids=coalesce(result_row.tag_ids,'{}')
       where id=audit_row.transaction_id and user_id=actor;

   end if;
   result := jsonb_build_object('undone',audit_row.transaction_id);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
revoke all on function public.commit_financial_operation_base(uuid,jsonb) from public, authenticated;
commit;
