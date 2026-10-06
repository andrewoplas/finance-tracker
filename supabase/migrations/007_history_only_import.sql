begin;
-- History imports preserve unknown baselines. Caches remain internal ledger deltas;
-- only ledger_*_balances derived_balance is an absolute balance.
alter table public.accounts add column opening_balance_unknown boolean not null default false;
alter table public.wallets add column opening_balance_unknown boolean not null default false;
create or replace function public.capture_opening_balance() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.opening_balance_unknown then new.opening_balance:=null;
 else new.opening_balance:=coalesce(new.opening_balance,new.balance,0); end if;
 return new;
end $$;
-- Status follows the reconciled baseline, so later reconciliation changes it.
alter table public.accounts add column reconciliation_status text generated always as
 (case when opening_balance is null then 'unknown' else 'reconciled' end) stored;
alter table public.wallets add column reconciliation_status text generated always as
 (case when opening_balance is null then 'unknown' else 'reconciled' end) stored;
create or replace function public.audit_opening_balance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.opening_balance is null then return new; end if;
 insert into public.balance_reconciliations(user_id,target_id,target_type,source,as_of_date,observed_balance,reason,before_row,after_row)
 values(new.user_id,new.id,case when TG_TABLE_NAME='accounts' then 'account' else 'wallet' end,'creation',
 (now() at time zone 'Asia/Manila')::date,coalesce(new.opening_balance,0),'Initial opening balance',
 jsonb_build_object('name',new.name,'balance',0,'opening_balance',null,'revision',0),to_jsonb(new));
 return new;
end $$;

create or replace function public.commit_financial_operation(request_id uuid, operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor uuid:=auth.uid(); previous public.financial_requests; kind text:=operation->>'action';
 result jsonb; item jsonb; entry jsonb; staged jsonb:='[]'; matches jsonb; decision text;
 batch public.import_batches; purchase public.transactions; plan public.installment_plans;
 schedule public.installment_items; receivable public.receivables; payment record;
 before_row jsonb; after_row jsonb; txn_result jsonb; affected uuid[]:='{}'; account_id uuid;
 n integer; i integer; cents bigint; personal_cents bigint; total numeric; allocated numeric;
 paid numeric; money_value numeric; opening numeric; delta numeric; current_revision integer;
 target_kind text; target_id uuid; as_of date; new_id uuid; txn_id uuid; bill date; due date;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into previous from public.financial_requests r where r.user_id=actor and r.request_id=commit_financial_operation.request_id;
 if found then
  if previous.payload<>operation then raise exception 'Idempotency key reused with different payload'; end if;
  return previous.result;
 end if;
 if kind in ('create','amend','reverse','undo','post_recurring') then
  if kind in ('amend','reverse','undo') and (
   exists(select 1 from public.workflow_transactions where transaction_id=(operation->>'id')::uuid and user_id=actor) or
   exists(select 1 from public.installment_plans where transaction_id=(operation->>'id')::uuid and user_id=actor) or
   exists(select 1 from public.receivables where transaction_id=(operation->>'id')::uuid and user_id=actor)
  ) then
   if kind<>'amend' then raise exception 'Linked transaction: use workflow settlement reversal or cancel the unpaid plan first'; end if;
   select * into purchase from public.transactions where id=(operation->>'id')::uuid and user_id=actor;
   entry:=operation->'entry';
   if not found or (entry->>'account_id')::uuid is distinct from purchase.account_id or (entry->>'wallet_id')::uuid is distinct from purchase.wallet_id
    or entry->>'type' is distinct from purchase.type or (entry->>'amount')::numeric is distinct from purchase.amount
    or (entry->>'date')::date is distinct from purchase.date or (entry->>'to_account_id')::uuid is distinct from purchase.to_account_id
    or (entry->>'bill_date')::date is distinct from purchase.bill_date or (entry->>'paid_date')::date is distinct from purchase.paid_date
    or entry->>'report_month' is distinct from purchase.report_month or entry->>'attribution' is distinct from purchase.attribution
    or (entry->>'personal_amount')::numeric is distinct from purchase.personal_amount then
     raise exception 'Linked financial values are protected; reverse settlements or cancel the unpaid plan first';
   end if;
  end if;
  return public.commit_financial_operation_base(request_id,operation);
 elsif kind='stage_import' then
  if jsonb_typeof(operation->'rows') is distinct from 'array' or jsonb_array_length(operation->'rows') not between 1 and 100 then raise exception 'Stage 1 to 100 rows'; end if;
  if (select count(distinct value->>'source_row') from jsonb_array_elements(operation->'rows'))<>jsonb_array_length(operation->'rows') then raise exception 'Source row IDs must be unique'; end if;
  for item in select value from jsonb_array_elements(operation->'rows') loop
   entry:=item->'entry'; matches:='[]';
   begin
    if entry is null or entry='null' then raise exception 'Unmapped row'; end if;
    perform public.validate_workflow_entry(entry,actor);
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'date',t.date,'description',t.description,'amount',t.amount::text,'account_id',t.account_id)), '[]') into matches
      from public.transactions t where t.user_id=actor and t.account_id=(entry->>'account_id')::uuid and t.type=entry->>'type'
      and t.date=(entry->>'date')::date and t.amount=(entry->>'amount')::numeric and lower(trim(coalesce(t.description,'')))=lower(trim(entry->>'description'));
    if exists(select 1 from jsonb_array_elements(staged) s where s->'entry'->>'account_id'=entry->>'account_id' and s->'entry'->>'date'=entry->>'date'
      and s->'entry'->>'type'=entry->>'type' and (s->'entry'->>'amount')::numeric=(entry->>'amount')::numeric
      and lower(trim(s->'entry'->>'description'))=lower(trim(entry->>'description'))) then
       matches:=matches||jsonb_build_array(jsonb_build_object('source','earlier row in this batch'));
    end if;
    staged:=staged||jsonb_build_array(jsonb_build_object('source_row',item->'source_row','entry',entry,'source',item->'source','status',case when jsonb_array_length(matches)>0 then 'duplicate' else 'ready' end,'matches',matches));
   exception when others then
    staged:=staged||jsonb_build_array(jsonb_build_object('source_row',item->'source_row','entry',null,'source',item->'source','status','exception','reason','Correct the source values and account mapping, or skip this row'));
   end;
  end loop;
  insert into public.import_batches(user_id,name,rows) values(actor,operation->>'name',staged) returning * into batch;
  result:=to_jsonb(batch);
 elsif kind='commit_import' then
  if coalesce(operation->>'mode','reconciled') not in ('reconciled','history_only') then raise exception 'Invalid import mode'; end if;
  if operation->>'mode'='history_only' and operation->'closing_balances'<>'[]'::jsonb then raise exception 'History-only import cannot assert closing balances'; end if;
  select * into batch from public.import_batches where id=(operation->>'id')::uuid and user_id=actor for update;
  if not found or batch.state<>'staged' or batch.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Batch changed or already committed' using errcode='40001'; end if;
  if jsonb_typeof(operation->'decisions') is distinct from 'array' or jsonb_array_length(operation->'decisions')<>jsonb_array_length(batch.rows)
    or (select count(distinct value->>'source_row') from jsonb_array_elements(operation->'decisions'))<>jsonb_array_length(batch.rows) then raise exception 'Review every row exactly once'; end if;
  if jsonb_typeof(operation->'closing_balances') is distinct from 'array' then raise exception 'Closing balances required'; end if;
  if (select count(distinct value->>'account_id') from jsonb_array_elements(operation->'closing_balances'))<>jsonb_array_length(operation->'closing_balances') then raise exception 'Duplicate closing balance'; end if;
  staged:='[]';
  for item in select value from jsonb_array_elements(batch.rows) loop
   select d->>'decision' into decision from jsonb_array_elements(operation->'decisions') d where d->>'source_row'=item->>'source_row';
   if decision is null or decision not in ('skip','include','include_duplicate') then raise exception 'Unresolved review decision'; end if;
   if decision='skip' then continue; end if;
   if item->>'status'='exception' then raise exception 'Exception rows cannot be committed'; end if;
   entry:=item->'entry'; perform public.validate_workflow_entry(entry,actor);
   if decision<>'include_duplicate' and ((item->>'status')='duplicate' or exists(select 1 from public.transactions t where t.user_id=actor and t.account_id=(entry->>'account_id')::uuid and t.type=entry->>'type' and t.date=(entry->>'date')::date and t.amount=(entry->>'amount')::numeric and lower(trim(coalesce(t.description,'')))=lower(trim(entry->>'description')))) then raise exception 'Duplicate found: explicitly include or skip' using errcode='40001'; end if;
   foreach account_id in array array[(entry->>'account_id')::uuid,(entry->>'to_account_id')::uuid] loop
    if account_id is null then continue; end if;
    if operation->>'mode'='history_only' then
     if not exists(select 1 from public.accounts a where a.id=account_id and a.user_id=actor and a.opening_balance is null) then raise exception 'History-only import requires an owned account with unknown opening balance'; end if;
    elsif not exists(select 1 from jsonb_array_elements(operation->'closing_balances') c where (c->>'account_id')::uuid=account_id and (c->>'as_of_date')::date>=(entry->>'date')::date) then raise exception 'Closing statement required for each affected account'; end if;
    affected:=array_append(affected,account_id);
   end loop;
   if operation->>'mode'='history_only' then
    if entry->>'wallet_id' is not null then raise exception 'History-only wallet allocation requires separate review'; end if;
    entry:=jsonb_set(entry,'{review_status}','"pending"');
   end if;
   txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(entry)));
   staged:=staged||txn_result;
  end loop;
  for item in select value from jsonb_array_elements(operation->'closing_balances') loop
   target_id:=(item->>'account_id')::uuid; as_of:=(item->>'as_of_date')::date;
   select a.opening_balance into opening from public.accounts a where a.id=target_id and a.user_id=actor;
   if not found or opening is null then raise exception 'Reconcile opening balance before import'; end if;
   select coalesce(sum(case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end),0) into delta
    from public.transactions t where t.user_id=actor and t.date<=as_of and (t.account_id=target_id or (t.type='transfer' and t.to_account_id=target_id));
   if opening+delta<>public.finance_amount(item->>'balance',true,true) then raise exception 'Closing balance mismatch: entire import rolled back'; end if;
  end loop;
  update public.import_batches set state='committed',revision=revision+1,result=jsonb_build_object('transactions',staged,'decisions',operation->'decisions','closing_balances',operation->'closing_balances','mode',coalesce(operation->>'mode','reconciled'),'attribution_status',case when operation->>'mode'='history_only' then 'unreviewed' else 'source' end) where id=batch.id returning * into batch;
  result:=to_jsonb(batch);
 elsif kind='create_installments' then
  select * into purchase from public.transactions where id=(operation->>'transaction_id')::uuid and user_id=actor for update;
  if not found or purchase.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Purchase changed' using errcode='40001'; end if;
  if purchase.type<>'expense' or not exists(select 1 from public.accounts where id=purchase.account_id and user_id=actor and type='credit-card') then raise exception 'Installments require a recorded credit-card purchase'; end if;
  n:=(operation->>'count')::integer; cents:=(purchase.amount*100)::bigint;
  personal_cents:=(case when purchase.attribution='personal' then purchase.amount else purchase.personal_amount end*100)::bigint;
  if n is null or n not between 1 and 120 or n>cents then raise exception 'Invalid installment count'; end if;
  if (operation->>'first_bill_date')::date<purchase.date then raise exception 'Bill cannot precede purchase'; end if;
  insert into public.installment_plans(user_id,transaction_id,reporting_basis) values(actor,purchase.id,operation->>'reporting_basis') returning * into plan;
  for i in 0..n-1 loop
   bill:=public.finance_shift_date((operation->>'first_bill_date')::date,i); due:=public.finance_shift_date((operation->>'first_due_date')::date,i);
   insert into public.installment_items(user_id,plan_id,sequence,bill_date,due_date,report_month,amount,personal_amount)
   values(actor,plan.id,i+1,bill,due,to_char(public.finance_shift_date(((operation->>'first_report_month')||'-01')::date,i),'YYYY-MM'),
    (cents/n+case when i<cents%n then 1 else 0 end)::numeric/100,
    (personal_cents/n+case when i<personal_cents%n then 1 else 0 end)::numeric/100);
  end loop;
  result:=to_jsonb(plan);
 elsif kind='pay_installment' then
  select * into schedule from public.installment_items where id=(operation->>'item_id')::uuid and user_id=actor;
  if not found then raise exception 'Installment unavailable'; end if;
  select * into plan from public.installment_plans where id=schedule.plan_id and user_id=actor for update;
  if plan.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Plan changed' using errcode='40001'; end if;
  select * into purchase from public.transactions where id=plan.transaction_id and user_id=actor;
  select coalesce(sum(t.amount),0) into paid from public.installment_payments p join public.transactions t on t.id=p.transaction_id where p.item_id=schedule.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>schedule.amount-paid then raise exception 'Payment exceeds remaining installment'; end if;
  txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(jsonb_build_object(
    'account_id',operation->>'account_id','to_account_id',purchase.account_id,'type','transfer','amount',money_value::text,'description','Installment: '||purchase.description,
    'date',operation->>'date','paid_date',operation->>'date','bill_date',schedule.bill_date,'report_month',left(operation->>'date',7)))));
  txn_id:=(txn_result->0->>'id')::uuid;
  insert into public.installment_payments(user_id,item_id,transaction_id) values(actor,schedule.id,txn_id) returning id into new_id;
  insert into public.workflow_transactions values(txn_id,actor,'installment_payment',now());
  update public.installment_plans set revision=revision+1 where id=plan.id;
  result:=jsonb_build_object('id',new_id,'transaction_id',txn_id,'remaining',schedule.amount-paid-money_value,'revision',plan.revision+1);
 elsif kind='create_receivable' then
  select * into purchase from public.transactions where id=(operation->>'transaction_id')::uuid and user_id=actor for update;
  if not found or purchase.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Purchase changed' using errcode='40001'; end if;
  if purchase.type<>'expense' or purchase.attribution='personal' then raise exception 'Record a shared or reimbursable expense first'; end if;
  select coalesce(sum(amount),0) into allocated from public.receivables where transaction_id=purchase.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>purchase.amount-purchase.personal_amount-allocated then raise exception 'Allocation exceeds recoverable share'; end if;
  insert into public.receivables(user_id,transaction_id,counterparty,amount) values(actor,purchase.id,operation->>'counterparty',money_value) returning * into receivable;
  result:=to_jsonb(receivable);
 elsif kind='collect_receivable' then
  select * into receivable from public.receivables where id=(operation->>'id')::uuid and user_id=actor for update;
  if not found or receivable.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Receivable changed' using errcode='40001'; end if;
  select coalesce(sum(t.amount),0) into paid from public.receivable_collections c join public.transactions t on t.id=c.transaction_id where c.receivable_id=receivable.id;
  money_value:=public.finance_amount(operation->>'amount');
  if money_value>receivable.amount-paid then raise exception 'Collection exceeds outstanding amount'; end if;
  txn_result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','create','entries',jsonb_build_array(jsonb_build_object(
    'account_id',operation->>'account_id','type','income','amount',money_value::text,'description','Reimbursement: '||receivable.counterparty,
    'date',operation->>'date','paid_date',operation->>'date','report_month',left(operation->>'date',7)))));
  txn_id:=(txn_result->0->>'id')::uuid;
  insert into public.receivable_collections(user_id,receivable_id,transaction_id) values(actor,receivable.id,txn_id) returning id into new_id;
  insert into public.workflow_transactions values(txn_id,actor,'collection',now());
  update public.receivables set revision=revision+1 where id=receivable.id;
  result:=jsonb_build_object('id',new_id,'transaction_id',txn_id,'remaining',receivable.amount-paid-money_value,'revision',receivable.revision+1);
 elsif kind='reverse_settlement' then
  if operation->>'settlement_type'='collection' then
   select c.id,c.transaction_id,c.receivable_id as parent_id,r.revision into payment from public.receivable_collections c join public.receivables r on r.id=c.receivable_id where c.id=(operation->>'id')::uuid and c.user_id=actor for update of r;
   if not found or payment.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Collection changed' using errcode='40001'; end if;
   delete from public.receivable_collections where id=payment.id;
   update public.receivables set revision=revision+1 where id=payment.parent_id;
  elsif operation->>'settlement_type'='installment_payment' then
   select p.id,p.transaction_id,s.plan_id as parent_id,l.revision into payment from public.installment_payments p join public.installment_items s on s.id=p.item_id join public.installment_plans l on l.id=s.plan_id where p.id=(operation->>'id')::uuid and p.user_id=actor for update of l;
   if not found or payment.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Payment changed' using errcode='40001'; end if;
   delete from public.installment_payments where id=payment.id;
   update public.installment_plans set revision=revision+1 where id=payment.parent_id;
  else raise exception 'Invalid settlement type'; end if;
  select * into purchase from public.transactions where id=payment.transaction_id and user_id=actor;
  result:=public.commit_financial_operation_base(gen_random_uuid(),jsonb_build_object('action','reverse','id',purchase.id,'expected_revision',purchase.revision))||jsonb_build_object('before',to_jsonb(payment));
 elsif kind='cancel_plan' then
  if operation->>'plan_type'='receivable' then
   select * into receivable from public.receivables where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or receivable.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Receivable changed' using errcode='40001'; end if;
   if exists(select 1 from public.receivable_collections where receivable_id=receivable.id) then raise exception 'Reverse collections first'; end if;
   delete from public.receivables where id=receivable.id; result:=to_jsonb(receivable);
  elsif operation->>'plan_type'='installment' then
   select * into plan from public.installment_plans where id=(operation->>'id')::uuid and user_id=actor for update;
   if not found or plan.revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Plan changed' using errcode='40001'; end if;
   if exists(select 1 from public.installment_payments p join public.installment_items s on s.id=p.item_id where s.plan_id=plan.id) then raise exception 'Reverse payments first'; end if;
   select jsonb_agg(to_jsonb(s)) into staged from public.installment_items s where plan_id=plan.id;
   delete from public.installment_items where plan_id=plan.id; delete from public.installment_plans where id=plan.id;
   result:=to_jsonb(plan)||jsonb_build_object('schedule',staged);
  else raise exception 'Invalid plan type'; end if;
 elsif kind='reconcile_balance' then
  target_kind:=operation->>'target_type'; target_id:=(operation->>'id')::uuid; as_of:=(operation->>'as_of_date')::date;
  money_value:=public.finance_amount(operation->>'observed_balance',true,true);
  if target_kind='account' then
   select to_jsonb(a),a.revision into before_row,current_revision from public.accounts a where a.id=target_id and a.user_id=actor for update;
   if not found then raise exception 'Account unavailable'; end if;
   select coalesce(sum(case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end),0),
    coalesce(sum(case when t.date<=as_of then case when t.account_id=target_id then case when t.type='income' then t.amount else -t.amount end else t.amount end else 0 end),0)
    into total,delta from public.transactions t where t.user_id=actor and (t.account_id=target_id or (t.type='transfer' and t.to_account_id=target_id));
  elsif target_kind='wallet' then
   select to_jsonb(w),w.revision into before_row,current_revision from public.wallets w where w.id=target_id and w.user_id=actor for update;
   if not found then raise exception 'Wallet unavailable'; end if;
   select coalesce(sum(case when t.type='income' then t.amount else -t.amount end),0),
    coalesce(sum(case when t.date<=as_of then case when t.type='income' then t.amount else -t.amount end else 0 end),0)
    into total,delta from public.transactions t where t.user_id=actor and t.wallet_id=target_id and t.type<>'transfer';
  else raise exception 'Invalid reconciliation target'; end if;
  if current_revision is distinct from (operation->>'expected_revision')::integer then raise exception 'Balance changed: refresh before reconciling' using errcode='40001'; end if;
  if target_kind='account' then
   update public.accounts set opening_balance=money_value-delta,balance=money_value-delta+total where id=target_id returning to_jsonb(accounts.*) into after_row;
  else
   update public.wallets set opening_balance=money_value-delta,balance=money_value-delta+total where id=target_id returning to_jsonb(wallets.*) into after_row;
  end if;
  insert into public.balance_reconciliations(user_id,target_id,target_type,as_of_date,observed_balance,reason,before_row,after_row)
   values(actor,target_id,target_kind,as_of,money_value,operation->>'reason',before_row,after_row) returning id into new_id;
  result:=jsonb_build_object('id',new_id,'before',before_row,'after',after_row);
 else raise exception 'Unsupported operation'; end if;
 insert into public.financial_requests values(actor,request_id,operation,result,now());
 return result;
end $$;
commit;
