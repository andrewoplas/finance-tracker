-- Explicit activation approval required: new revocable expense-write credentials.
-- Creates no keys or financial entries. All saves use the existing audited operation.
begin;
create schema if not exists finance_private;
revoke all on schema finance_private from public,anon,authenticated,service_role;
create table if not exists public.quick_log_credentials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 label text not null check(length(label) between 1 and 60), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days', revoked_at timestamptz,
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 day_start date not null default current_date, day_count integer not null default 0, last_used_at timestamptz
);
create table if not exists public.quick_log_inbox (
 id uuid primary key, user_id uuid not null references public.profiles(id), entry jsonb not null,
 state text not null check(state in ('needs_review','recorded','dismissed')), revision integer not null default 1,
 transaction_id uuid, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists public.quick_log_requests (
 credential_id uuid not null references public.quick_log_credentials(id), request_id uuid not null,
 payload_hash text not null, result jsonb not null, created_at timestamptz not null default now(), primary key(credential_id,request_id)
);
alter table public.quick_log_credentials enable row level security;
alter table public.quick_log_inbox enable row level security;
alter table public.quick_log_requests enable row level security;
revoke all on public.quick_log_credentials,public.quick_log_inbox,public.quick_log_requests from public,anon,authenticated,service_role;
grant select on public.quick_log_inbox to authenticated;
drop policy if exists own_quick_inbox on public.quick_log_inbox;
create policy own_quick_inbox on public.quick_log_inbox for select to authenticated using((select auth.uid())=user_id);
create index if not exists quick_log_inbox_queue on public.quick_log_inbox(user_id,state,created_at);

create or replace function public.manage_quick_log_credential(p_action text,p_values jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.quick_log_credentials; result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'expires_at',c.expires_at,'revoked_at',c.revoked_at,'last_used_at',c.last_used_at) order by c.created_at desc),'[]') into result from public.quick_log_credentials c where c.user_id=actor;
  return result;
 elsif p_action='create' then
  if jsonb_typeof(p_values) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('label','token_hash'))
   or coalesce(p_values->>'token_hash','') !~ '^[a-f0-9]{64}$' or length(trim(coalesce(p_values->>'label',''))) not between 1 and 60 then raise exception 'Invalid credential settings'; end if;
  if (select count(*) from public.quick_log_credentials c where c.user_id=actor and c.revoked_at is null and c.expires_at>now())>=5 then raise exception 'Revoke an unused key before creating another'; end if;
  insert into public.quick_log_credentials(user_id,label,token_hash) values(actor,trim(p_values->>'label'),p_values->>'token_hash') returning * into target;
  return jsonb_build_object('id',target.id,'expires_at',target.expires_at);
 elsif p_action='revoke' then
  update public.quick_log_credentials c set revoked_at=coalesce(c.revoked_at,now()) where c.id=(p_values->>'id')::uuid and c.user_id=actor returning * into target;
  if not found then raise exception 'Credential unavailable'; end if;
  return jsonb_build_object('revoked',target.id);
 end if;
 raise exception 'Unsupported credential action';
end $$;
revoke all on function public.manage_quick_log_credential(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.manage_quick_log_credential(text,jsonb) to authenticated;

-- Different parser from bank SMS. Account must be an exact suffix, or the unique RCBC prefix alias.
create or replace function finance_private.parse_quick_log(p_text text,p_owner uuid,p_date date) returns jsonb
language plpgsql set search_path='' as $$
declare
 text_value text:=regexp_replace(trim(p_text),'[[:space:]]+',' ','g'); rest text; suffix text;
 account uuid; matches integer; tokens text[]; token text; description text:=''; amount text; dates integer:=0;
 entry_date date:=p_date; category uuid; category_seen boolean:=false; tags uuid[]:='{}'; tag uuid; food_seen boolean:=false;
begin
 if text_value is null or octet_length(text_value)>1000 or text_value !~* '^exp ' then return jsonb_build_object('error','use_exp_description_amount_account'); end if;
 if text_value ~* '\m(otp|cvv|cvc|password|pin|refund|repayment|payment|reversal|declined|pending|shared|reimbursable|installment|instalment)\M' or text_value ~ '[0-9]([ -]?[0-9]){12,}' or text_value ~* 'one[ -]?time|cash advance|https?://' then return jsonb_build_object('error','unsupported_event'); end if;
 rest:=substr(text_value,5);
 select count(*), (array_agg(a.id))[1],max(a.name) into matches,account,suffix from public.accounts a
  where a.user_id=p_owner and not a.is_archived and lower(right(rest,length(a.name)+1))=' '||lower(a.name);
 if matches=0 and lower(right(rest,5))=' rcbc' then
  select count(*),(array_agg(a.id))[1] into matches,account from public.accounts a where a.user_id=p_owner and not a.is_archived and a.name ~* '^RCBC(\M|$)';
  suffix:='rcbc';
 end if;
 if matches<>1 then return jsonb_build_object('error',case when matches=0 then 'account_required' else 'account_ambiguous' end); end if;
 rest:=left(rest,length(rest)-length(suffix)-1);
 tokens:=regexp_split_to_array(rest,' ');
 foreach token in array tokens loop
  if token ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then
   if amount is not null then return jsonb_build_object('error','amount_ambiguous'); end if;
   if token::numeric<=0 then return jsonb_build_object('error','invalid_amount'); end if;
   amount:=to_char(token::numeric,'FM9999999990.00');
  elsif token ~ '^\d{4}-\d{2}-\d{2}$' then
   dates:=dates+1;if dates>1 then return jsonb_build_object('error','date_ambiguous'); end if;
   begin entry_date:=token::date; exception when others then return jsonb_build_object('error','invalid_date'); end;
  elsif token ~ '^[0-9]|^[-+]?[0-9]+[.,/]' or lower(token) in ('today','yesterday','tomorrow') then return jsonb_build_object('error','use_exact_amount_and_full_date');
  elsif lower(token)='food' or left(token,1)='#' then
   if lower(token)='food' then
    if food_seen then return jsonb_build_object('error','tag_ambiguous'); end if; food_seen:=true;
   end if;
   select count(*),(array_agg(t.id))[1] into matches,tag from public.tags t where t.user_id=p_owner and lower(t.name)=lower(case when left(token,1)='#' then substr(token,2) else token end);
   if matches<>1 or tag=any(tags) or cardinality(tags)>=50 then return jsonb_build_object('error','tag_unavailable_or_ambiguous'); end if;
   tags:=array_append(tags,tag);
  elsif token ~* '^category:' then
   if category_seen then return jsonb_build_object('error','category_ambiguous'); end if; category_seen:=true;
   select count(*),(array_agg(c.id))[1] into matches,category from public.categories c where c.user_id=p_owner and c.type='expense' and lower(c.name)=lower(substr(token,10));
   if matches<>1 then return jsonb_build_object('error','category_unavailable_or_ambiguous'); end if;
  else description:=description||case when description='' then '' else ' ' end||token;
  end if;
 end loop;
 if amount is null then return jsonb_build_object('error','amount_required'); end if;
 if length(description) not between 1 and 300 then return jsonb_build_object('error','description_required'); end if;
 if entry_date is null or entry_date > (now() at time zone 'Asia/Manila')::date then return jsonb_build_object('error','invalid_date'); end if;
 return jsonb_build_object('account_id',account,'category_id',category,'tag_ids',to_jsonb(tags),'type','expense','amount',amount,'description',description,
  'date',entry_date,'report_month',to_char(entry_date,'YYYY-MM'),'attribution','personal','personal_amount',amount,'review_status','reviewed',
  'wallet_id',null,'to_account_id',null,'bill_date',null,'paid_date',null);
end $$;
revoke all on function finance_private.parse_quick_log(text,uuid,date) from public,anon,authenticated,service_role;

-- Temporarily bind only the validated credential owner for the existing audited operation.
-- Never callable by API roles; restore claims even when a validation/save throws.
create or replace function finance_private.save_expense(p_owner uuid,p_request uuid,p_entry jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare prior_sub text:=current_setting('request.jwt.claim.sub',true); prior_claims text:=current_setting('request.jwt.claims',true); result jsonb;
begin
 if p_entry->>'type'<>'expense' then raise exception 'Expense scope required'; end if;
 perform set_config('request.jwt.claim.sub',p_owner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_owner)::text,true);
 begin
  perform public.validate_workflow_entry(p_entry,p_owner);
  result:=public.commit_financial_operation(p_request,jsonb_build_object('action','create','entries',jsonb_build_array(p_entry)));
 exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);raise;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 return result;
end $$;
revoke all on function finance_private.save_expense(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.submit_quick_log(p_token text,p_request_id uuid,p_text text,p_action text,p_date date default null,p_digest text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare credential public.quick_log_credentials; prior public.quick_log_requests; parsed_entry jsonb; digest text; payload_hash text; result jsonb; saved jsonb; possible boolean; receipt_id uuid;
begin
 if p_token is null or p_token !~ '^ft_quick_[a-f0-9]{64}$' then return jsonb_build_object('error','unauthorized'); end if;
 select * into credential from public.quick_log_credentials c where c.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return jsonb_build_object('error','unauthorized'); end if;
 perform pg_advisory_xact_lock(hashtextextended(credential.user_id::text,0));
 select * into credential from public.quick_log_credentials c where c.id=credential.id for update;
 if credential.revoked_at is not null or credential.expires_at<=now() then return jsonb_build_object('error','unauthorized'); end if;
 if p_request_id is null or (p_action is null or p_action not in ('preview','commit')) or p_text is null or octet_length(p_text)>1000 then return jsonb_build_object('error','invalid_input'); end if;
 payload_hash:=encode(sha256(convert_to(jsonb_build_array(p_text,p_date,p_digest)::text,'UTF8')),'hex');
 if p_action='commit' then
  select * into prior from public.quick_log_requests r where r.credential_id=credential.id and r.request_id=p_request_id;
  if found then
   if prior.payload_hash<>payload_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
   return prior.result||jsonb_build_object('duplicate',true);
  end if;
 end if;
 if credential.minute_start<date_trunc('minute',now()) then credential.minute_count:=0; end if;
 if credential.day_start<>(now() at time zone 'UTC')::date then credential.day_count:=0; end if;
 if credential.minute_count>=20 or credential.day_count>=200 then return jsonb_build_object('error','rate_limited'); end if;
 update public.quick_log_credentials c set minute_start=date_trunc('minute',now()),minute_count=credential.minute_count+1,day_start=(now() at time zone 'UTC')::date,day_count=credential.day_count+1,last_used_at=now() where c.id=credential.id;
 parsed_entry:=finance_private.parse_quick_log(p_text,credential.user_id,coalesce(p_date,(now() at time zone 'Asia/Manila')::date));
 if parsed_entry ? 'error' then return parsed_entry; end if;
 digest:=encode(sha256(convert_to(parsed_entry::text,'UTF8')),'hex');
 if p_action='preview' then return jsonb_build_object('request_id',p_request_id,'entry',parsed_entry,'summary',jsonb_build_object('account',(select a.name from public.accounts a where a.id=(parsed_entry->>'account_id')::uuid and a.user_id=credential.user_id),'category',(select c.name from public.categories c where c.id=(parsed_entry->>'category_id')::uuid and c.user_id=credential.user_id),'tags',coalesce((select jsonb_agg(t.name order by t.name) from public.tags t where t.user_id=credential.user_id and t.id in (select value::uuid from jsonb_array_elements_text(parsed_entry->'tag_ids'))),'[]'::jsonb)),'date',parsed_entry->>'date','digest',digest,'persisted',false); end if;
 if p_date is null or p_digest is distinct from digest then return jsonb_build_object('error','preview_required'); end if;
 possible:=exists(select 1 from public.transactions t where t.user_id=credential.user_id and t.account_id=(parsed_entry->>'account_id')::uuid and t.type='expense' and t.amount=(parsed_entry->>'amount')::numeric and t.date=(parsed_entry->>'date')::date and lower(trim(t.description))=lower(parsed_entry->>'description'))
  or exists(select 1 from public.quick_log_inbox i where i.user_id=credential.user_id and i.state<>'dismissed' and i.entry->>'account_id'=parsed_entry->>'account_id' and i.entry->>'date'=parsed_entry->>'date' and i.entry->>'amount'=parsed_entry->>'amount' and lower(i.entry->>'description')=lower(parsed_entry->>'description'))
  or exists(select 1 from public.card_sms_inbox i where i.user_id=credential.user_id and i.account_id=(parsed_entry->>'account_id')::uuid and i.state<>'dismissed' and i.amount=(parsed_entry->>'amount')::numeric and lower(i.merchant)=lower(parsed_entry->>'description') and (i.transaction_date is null or i.transaction_date=(parsed_entry->>'date')::date));
 receipt_id:=gen_random_uuid();
 if possible then
  if (select count(*) from public.quick_log_inbox i where i.user_id=credential.user_id and i.state='needs_review')>=500 then return jsonb_build_object('error','inbox_full'); end if;
  insert into public.quick_log_inbox(id,user_id,entry,state) values(receipt_id,credential.user_id,parsed_entry,'needs_review');
  result:=jsonb_build_object('id',receipt_id,'status','needs_review','persisted',false,'duplicate',false);
 else
  saved:=finance_private.save_expense(credential.user_id,receipt_id,parsed_entry);
  result:=jsonb_build_object('id',receipt_id,'status','recorded','transaction_id',saved->0->>'id','persisted',true,'duplicate',false);
 end if;
 insert into public.quick_log_requests(credential_id,request_id,payload_hash,result) values(credential.id,p_request_id,payload_hash,result);
 return result;
end $$;
revoke all on function public.submit_quick_log(text,uuid,text,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_quick_log(text,uuid,text,text,date,text) to anon;

create or replace function public.review_quick_log(p_id uuid,p_revision integer,p_action text,p_confirm_distinct boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.quick_log_inbox; saved jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into receipt from public.quick_log_inbox i where i.id=p_id and i.user_id=actor for update;
 if not found then raise exception 'Inbox item unavailable'; end if;
 if p_action='record' and receipt.state='recorded' then return jsonb_build_object('status','recorded','id',receipt.id,'transaction_id',receipt.transaction_id); end if;
 if p_action='dismiss' and receipt.state='dismissed' then return jsonb_build_object('status','dismissed','id',receipt.id); end if;
 if receipt.state<>'needs_review' or receipt.revision is distinct from p_revision then raise exception 'Inbox item changed' using errcode='40001'; end if;
 if p_action='dismiss' then
  update public.quick_log_inbox set state='dismissed',revision=revision+1,reviewed_at=now() where id=receipt.id;
  return jsonb_build_object('status','dismissed','id',receipt.id);
 end if;
 if p_action<>'record' or p_confirm_distinct is distinct from true then raise exception 'Confirm this is a separate expense'; end if;
 saved:=finance_private.save_expense(actor,receipt.id,receipt.entry);
 update public.quick_log_inbox set state='recorded',revision=revision+1,transaction_id=(saved->0->>'id')::uuid,reviewed_at=now() where id=receipt.id;
 return jsonb_build_object('status','recorded','id',receipt.id,'transaction_id',saved->0->>'id');
end $$;
revoke all on function public.review_quick_log(uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.review_quick_log(uuid,integer,text,boolean) to authenticated;
commit;
