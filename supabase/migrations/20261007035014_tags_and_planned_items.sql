begin;
-- Tag IDs are part of the audited transaction snapshot. The normalized join is
-- maintained only by a trigger, so relations and undo cannot drift apart.
create table public.tags (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 name text not null check(length(trim(name)) between 1 and 60),
 created_at timestamptz not null default now(), unique(user_id,id), unique(user_id,name)
);
alter table public.transactions add column tag_ids uuid[] not null default '{}';
alter table public.transactions add constraint transaction_owner_id_unique unique(user_id,id);
create table public.transaction_tags (
 user_id uuid not null, transaction_id uuid not null, tag_id uuid not null,
 primary key(transaction_id,tag_id),
 foreign key(user_id,transaction_id) references public.transactions(user_id,id) on delete cascade,
 foreign key(user_id,tag_id) references public.tags(user_id,id)
);
create index transaction_tags_owner_tag on public.transaction_tags(user_id,tag_id,transaction_id);
create table public.planned_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 account_id uuid not null, description text not null check(length(description) between 1 and 300),
 type text not null check(type in ('income','expense')), amount numeric(12,2) not null check(amount>0),
 source_date_label text not null check(length(source_date_label) between 1 and 100),
 confirmed_date date, cadence text, remaining_count integer check(remaining_count>0),
 tag_names text[] not null default '{}', category_hint text,
 source_ref text not null, source jsonb not null,
 status text not null default 'planned' check(status='planned'),
 created_at timestamptz not null default now(), unique(user_id,source_ref)
);
-- Composite reference also enforces ownership for privileged imports.
alter table public.accounts add constraint account_owner_id_unique unique(user_id,id);
alter table public.planned_items add constraint planned_account_owner foreign key(user_id,account_id) references public.accounts(user_id,id);
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.planned_items enable row level security;
create policy owner_read on public.tags for select to authenticated using((select auth.uid())=user_id);
create policy owner_create on public.tags for insert to authenticated with check((select auth.uid())=user_id);
create policy owner_read on public.transaction_tags for select to authenticated using((select auth.uid())=user_id);
create policy owner_read on public.planned_items for select to authenticated using((select auth.uid())=user_id);
revoke all on public.tags,public.transaction_tags,public.planned_items from public,anon,authenticated,service_role;
grant select on public.tags,public.transaction_tags,public.planned_items to authenticated;
grant insert on public.tags to authenticated;
create index planned_items_owner on public.planned_items(user_id);

create function public.validate_transaction_tags() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 new.tag_ids:=coalesce(new.tag_ids,'{}');
 if cardinality(new.tag_ids)>50 or cardinality(new.tag_ids)<>(select count(distinct x) from unnest(new.tag_ids) x) then raise exception 'Invalid tag list'; end if;
 if exists(select 1 from unnest(new.tag_ids) x where not exists(select 1 from public.tags t where t.id=x and t.user_id=new.user_id)) then raise exception 'Invalid tag owner'; end if;
 return new;
end $$;
create trigger validate_transaction_tags before insert or update on public.transactions for each row execute function public.validate_transaction_tags();
create function public.sync_transaction_tags() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.transaction_tags where transaction_id=new.id and user_id=new.user_id;
 insert into public.transaction_tags(user_id,transaction_id,tag_id) select new.user_id,new.id,x from unnest(new.tag_ids) x;
 return new;
end $$;
create trigger sync_transaction_tags after insert or update of tag_ids on public.transactions for each row execute function public.sync_transaction_tags();
revoke all on function public.validate_transaction_tags(),public.sync_transaction_tags() from public,anon,authenticated,service_role;
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
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     insert into public.transactions(user_id,account_id,category_id,wallet_id,type,amount,description,date,to_account_id,bill_date,paid_date,report_month,attribution,personal_amount,review_status,tag_ids)
     values(actor,(entry->>'account_id')::uuid,(entry->>'category_id')::uuid,(entry->>'wallet_id')::uuid,entry->>'type',(entry->>'amount')::numeric,
       entry->>'description',(entry->>'date')::date,(entry->>'to_account_id')::uuid,(entry->>'bill_date')::date,(entry->>'paid_date')::date,
       entry->>'report_month',coalesce(entry->>'attribution','personal'),coalesce((entry->>'personal_amount')::numeric,0),coalesce(entry->>'review_status','pending'),array(select jsonb_array_elements_text(coalesce(entry->'tag_ids','[]'))::uuid)) returning * into result_row;
     result := result || jsonb_build_array(to_jsonb(result_row));
   end loop;
 elsif kind = 'post_recurring' then
   select * into recurring from public.recurring_transactions where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or not recurring.is_active or recurring.next_date is distinct from (operation->>'expected_next_date')::date then raise exception 'Schedule conflict' using errcode='40001'; end if;
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
     if entry->>'amount' is null or not ((entry->>'amount') ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$') then raise exception 'Exact decimal amount required'; end if;
     update public.transactions set account_id=(entry->>'account_id')::uuid, category_id=(entry->>'category_id')::uuid,
       wallet_id=(entry->>'wallet_id')::uuid,type=entry->>'type',amount=(entry->>'amount')::numeric,description=entry->>'description',
       date=(entry->>'date')::date,to_account_id=(entry->>'to_account_id')::uuid,bill_date=(entry->>'bill_date')::date,paid_date=(entry->>'paid_date')::date,
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
       date=result_row.date,to_account_id=result_row.to_account_id,bill_date=result_row.bill_date,paid_date=result_row.paid_date,
       report_month=result_row.report_month,attribution=result_row.attribution,personal_amount=result_row.personal_amount,review_status=result_row.review_status,tag_ids=coalesce(result_row.tag_ids,'{}')
       where id=audit_row.transaction_id and user_id=actor;

   end if;
   result := jsonb_build_object('undone',audit_row.transaction_id);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
create or replace function public.update_account_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP='UPDATE' and new.user_id is not distinct from old.user_id and new.account_id is not distinct from old.account_id and new.to_account_id is not distinct from old.to_account_id and new.type is not distinct from old.type and new.amount is not distinct from old.amount then return new; end if;
  -- Stable lock ordering prevents opposite transfers deadlocking.
  perform 1 from public.accounts where id in (
    case when TG_OP <> 'INSERT' then old.account_id end,
    case when TG_OP <> 'INSERT' then old.to_account_id end,
    case when TG_OP <> 'DELETE' then new.account_id end,
    case when TG_OP <> 'DELETE' then new.to_account_id end
  ) order by id for update;
  if TG_OP <> 'INSERT' then
    update public.accounts set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.account_id and user_id = old.user_id;
    if old.type = 'transfer' then
      update public.accounts set balance = balance - old.amount where id = old.to_account_id and user_id = old.user_id;
    end if;
  end if;
  if TG_OP <> 'DELETE' then
    update public.accounts set balance = balance + case when new.type = 'income' then new.amount else -new.amount end
    where id = new.account_id and user_id = new.user_id;
    if new.type = 'transfer' then
      update public.accounts set balance = balance + new.amount where id = new.to_account_id and user_id = new.user_id;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create or replace function public.update_wallet_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP='UPDATE' and new.user_id is not distinct from old.user_id and new.wallet_id is not distinct from old.wallet_id and new.type is not distinct from old.type and new.amount is not distinct from old.amount then return new; end if;
  perform 1 from public.wallets where id in (
    case when TG_OP <> 'INSERT' then old.wallet_id end,
    case when TG_OP <> 'DELETE' then new.wallet_id end
  ) order by id for update;
  if TG_OP <> 'INSERT' and old.type <> 'transfer' then
    update public.wallets set balance = balance + case when old.type = 'income' then -old.amount else old.amount end
    where id = old.wallet_id and user_id = old.user_id;
  end if;
  if TG_OP <> 'DELETE' and new.type <> 'transfer' then
    update public.wallets set balance = balance + case when new.type = 'income' then new.amount else -new.amount end
    where id = new.wallet_id and user_id = new.user_id;
  end if;
  return coalesce(new, old);
end $$;
commit;
