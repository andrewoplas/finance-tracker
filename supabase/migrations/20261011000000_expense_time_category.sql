-- Time is the actual Manila wall-clock time, never the insertion timestamp.
-- Legacy records keep NULL when their time is unknown. Undo preserves legacy categories.
begin;
-- Reuse the existing nullable time column; no historical data is rewritten.
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
   select * into recurring from public.recurring_transactions where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or not recurring.is_active or recurring.next_date is distinct from (operation->>'expected_next_date')::date then raise exception 'Schedule conflict' using errcode='40001'; end if;
   if recurring.type='expense' and recurring.category_id is null then raise exception 'Choose a category for this expense'; end if;
   if recurring.type='transfer' then raise exception 'Recurring transfers require destination mapping'; end if;
   insert into public.transactions(user_id,account_id,category_id,type,amount,description,date,report_month,is_recurring,recurring_id)
   values(actor,recurring.account_id,recurring.category_id,recurring.type,recurring.amount,recurring.description,(operation->>'date')::date,
   to_char((operation->>'date')::date,'YYYY-MM'),true,recurring.id) returning * into result_row;
   if recurring.frequency='daily' then next_day:=recurring.next_date+1;
   elsif recurring.frequency='weekly' then next_day:=recurring.next_date+7;
   else
     month_start:=(date_trunc('month',recurring.next_date)+case when recurring.frequency='yearly' then interval '1 year' else interval '1 month' end)::date;
     next_day:=month_start+least(coalesce(recurring.anchor_day,extract(day from recurring.next_date)::integer),extract(day from month_start+interval '1 month - 1 day')::integer)-1;
   end if;
   update public.recurring_transactions set next_date=next_day,anchor_day=coalesce(anchor_day,extract(day from recurring.next_date)::integer) where id=recurring.id;
   result:=to_jsonb(result_row);
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
