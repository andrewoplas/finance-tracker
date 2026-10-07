-- Activation creates a new, token-scoped ingestion boundary. Apply only after approval.
-- No keys, account mappings, imported messages, or ledger entries are created here.
begin;

create table if not exists public.card_sms_credentials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 account_id uuid not null, last4 text not null check(last4 ~ '^[0-9]{4}$'),
 label text not null check(length(label) between 1 and 60),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days',
 revoked_at timestamptz, last_used_at timestamptz,
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 day_start date not null default current_date, day_count integer not null default 0,
 foreign key(user_id,account_id) references public.accounts(user_id,id)
);
create table if not exists public.card_sms_inbox (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 account_id uuid not null, last4 text not null, merchant text not null, amount numeric(12,2) not null check(amount>0),
 received_at timestamptz not null, sms_date_label text not null, transaction_date date,
 date_issue text, possible_duplicate boolean not null default false,
 message_hash text not null, receipt_year integer not null, parser_version integer not null default 1,
 state text not null default 'needs_review' check(state in ('needs_review','recorded','dismissed')),
 revision integer not null default 1, transaction_id uuid, reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(user_id,account_id) references public.accounts(user_id,id),
 unique(user_id,account_id,message_hash,receipt_year)
);
create index if not exists card_sms_inbox_queue on public.card_sms_inbox(user_id,state,created_at);
create table if not exists public.card_sms_requests (
 credential_id uuid not null references public.card_sms_credentials(id), request_id uuid not null,
 payload_hash text not null, inbox_id uuid not null references public.card_sms_inbox(id),
 created_at timestamptz not null default now(), primary key(credential_id,request_id)
);
alter table public.card_sms_credentials enable row level security;
alter table public.card_sms_inbox enable row level security;
alter table public.card_sms_requests enable row level security;
revoke all on public.card_sms_credentials,public.card_sms_inbox,public.card_sms_requests from public,anon,authenticated,service_role;
-- Hashes and counters never leave the database; key metadata is exposed by a narrow RPC.
grant select on public.card_sms_inbox to authenticated;
drop policy if exists own_sms_inbox on public.card_sms_inbox;
create policy own_sms_inbox on public.card_sms_inbox for select to authenticated using((select auth.uid())=user_id);

create or replace function public.parse_rcbc_purchase(p_sms text,p_received_at text,p_now timestamptz default now()) returns jsonb
language plpgsql set search_path='' as $parser$
declare
 normalized text; parts text[]; received timestamptz; local_received timestamp;
 candidate timestamp; resolved timestamp; candidates integer:=0; valid_dates integer:=0;
 yr integer; hh integer; issue text; amount numeric; merchant text;
begin
 if p_sms is null or octet_length(p_sms)>2000 or p_received_at is null or length(p_received_at)>40 then return jsonb_build_object('error','invalid_input'); end if;
 if p_received_at !~ '^\d{4}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$' then return jsonb_build_object('error','received_at_requires_offset'); end if;
 begin received:=p_received_at::timestamptz; exception when others then return jsonb_build_object('error','invalid_received_at'); end;
 normalized:=regexp_replace(trim(replace(p_sms,chr(8217),chr(39))),'[[:space:]]+',' ','g');
 -- Only the approved-purchase template and its known, optional safety footer are accepted.
 -- Unsupported messages (including OTPs, repayments, refunds and declines) are never retained.
 parts:=regexp_match(normalized,$sms$^Your transaction at (.{1,160}) on ([0-9]{2})/([0-9]{2}) (0?[1-9]|1[0-2]):([0-5][0-9])(AM|PM) for PHP((?:[1-9][0-9]{0,2}(?:,[0-9]{3})+|[0-9]{1,10})\.[0-9]{2}) using your Card ending in [xX*]{4}([0-9]{4}) is approved\.(?: If you don't recognize this transaction, call 0288881888 immediately\. You can also lock your Card using the RCBC Pulz app to prevent unauthorized transactions\.)?$$sms$,'i');
 if parts is null then return jsonb_build_object('error','unsupported_message'); end if;
 merchant:=trim(parts[1]);
 if merchant ~* '\m(otp|cvv|cvc|password|pin|refund|repayment|payment|reversal|declined|installment|instalment)\M'
  or merchant ~ '[0-9]([ -]?[0-9]){12,}' or merchant ~* 'one[ -]?time|cash advance|https?://' then return jsonb_build_object('error','unsupported_message'); end if;
 amount:=replace(parts[7],',','')::numeric;
 if amount<=0 or amount>=10000000000 then return jsonb_build_object('error','invalid_amount'); end if;
 local_received:=received at time zone 'Asia/Manila';
 hh:=parts[4]::integer % 12 + case when upper(parts[6])='PM' then 12 else 0 end;
 for yr in extract(year from local_received)::integer-1 .. extract(year from local_received)::integer+1 loop
  begin
   candidate:=make_date(yr,parts[2]::integer,parts[3]::integer)+make_time(hh,parts[5]::integer,0);
   valid_dates:=valid_dates+1;
   if candidate between local_received-interval '72 hours' and local_received+interval '5 minutes' then candidates:=candidates+1; resolved:=candidate; end if;
  exception when datetime_field_overflow then null;
  end;
 end loop;
 if valid_dates=0 then issue:='impossible_sms_date';
 elsif received < p_now-interval '72 hours' or received > p_now+interval '5 minutes' then issue:='receipt_out_of_range';
 elsif candidates<>1 then issue:='sms_date_unresolved'; end if;
 return jsonb_build_object('merchant',merchant,'amount',to_char(amount,'FM9999999990.00'),'last4',parts[8],
  'received_at',received,'sms_date_label',parts[2]||'/'||parts[3]||' '||parts[4]||':'||parts[5]||upper(parts[6])||' (Asia/Manila; no year in SMS)',
  'transaction_date',case when issue is null then resolved::date end,'date_issue',issue,
  'receipt_year',case when issue is null then extract(year from resolved)::integer else extract(year from local_received)::integer end,
  'message_hash',encode(sha256(convert_to(jsonb_build_array(lower(merchant),parts[2],parts[3],hh,parts[5]::integer,amount,parts[8])::text,'UTF8')),'hex'));
end $parser$;
revoke all on function public.parse_rcbc_purchase(text,text,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.manage_card_sms_credential(p_action text,p_values jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; target public.card_sms_credentials; id uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'account_id',c.account_id,'last4',c.last4,'label',c.label,'created_at',c.created_at,'expires_at',c.expires_at,'revoked_at',c.revoked_at,'last_used_at',c.last_used_at) order by c.created_at desc),'[]') into result
   from public.card_sms_credentials c where c.user_id=actor;
  return result;
 elsif p_action='create' then
  if jsonb_typeof(p_values) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('account_id','last4','label','token_hash'))
   or coalesce(p_values->>'last4','') !~ '^[0-9]{4}$' or coalesce(p_values->>'token_hash','') !~ '^[a-f0-9]{64}$'
   or length(trim(coalesce(p_values->>'label',''))) not between 1 and 60 then raise exception 'Invalid credential settings'; end if;
  if not exists(select 1 from public.accounts a where a.id=(p_values->>'account_id')::uuid and a.user_id=actor and a.type='credit-card' and not a.is_archived) then raise exception 'Choose an owned active credit card'; end if;
  if (select count(*) from public.card_sms_credentials c where c.user_id=actor and c.revoked_at is null and c.expires_at>now())>=5 then raise exception 'Revoke an unused key before creating another'; end if;
  -- A last-four mapping cannot silently point at a different account, including expired keys.
  if exists(select 1 from public.card_sms_credentials c where c.user_id=actor and c.last4=p_values->>'last4' and c.account_id<>(p_values->>'account_id')::uuid) then raise exception 'Card ending already belongs to another mapping'; end if;
  insert into public.card_sms_credentials(user_id,account_id,last4,label,token_hash)
   values(actor,(p_values->>'account_id')::uuid,p_values->>'last4',trim(p_values->>'label'),p_values->>'token_hash') returning * into target;
  return jsonb_build_object('id',target.id,'expires_at',target.expires_at);
 elsif p_action='revoke' then
  update public.card_sms_credentials c set revoked_at=coalesce(c.revoked_at,now()) where c.id=(p_values->>'id')::uuid and c.user_id=actor returning c.id into id;
  if id is null then raise exception 'Credential unavailable'; end if;
  return jsonb_build_object('revoked',id);
 end if;
 raise exception 'Unsupported credential action';
end $$;
revoke all on function public.manage_card_sms_credential(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.manage_card_sms_credential(text,jsonb) to authenticated;

create or replace function public.submit_card_sms(p_token text,p_request_id uuid,p_sms text,p_received_at text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 credential public.card_sms_credentials; prior public.card_sms_requests; receipt public.card_sms_inbox;
 parsed jsonb; payload_hash text; is_duplicate boolean:=false; possible boolean:=false;
begin
 if p_token is null or p_token !~ '^ft_sms_[a-f0-9]{64}$' then return jsonb_build_object('error','unauthorized'); end if;
 select * into credential from public.card_sms_credentials c where c.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return jsonb_build_object('error','unauthorized'); end if;
 -- Same lock order as review and the existing ledger. Revocation and concurrent keys serialize here.
 perform pg_advisory_xact_lock(hashtextextended(credential.user_id::text,0));
 select * into credential from public.card_sms_credentials c where c.id=credential.id for update;
 if credential.revoked_at is not null or credential.expires_at<=now() or not exists(select 1 from public.accounts a where a.id=credential.account_id and a.user_id=credential.user_id and a.type='credit-card' and not a.is_archived) then return jsonb_build_object('error','unauthorized'); end if;
 if p_request_id is null or p_sms is null or octet_length(p_sms)>2000 or p_received_at is null or length(p_received_at)>40 then return jsonb_build_object('error','invalid_input'); end if;
 payload_hash:=encode(sha256(convert_to(jsonb_build_array(p_sms,p_received_at)::text,'UTF8')),'hex');
 select * into prior from public.card_sms_requests r where r.credential_id=credential.id and r.request_id=p_request_id;
 if found then
  if prior.payload_hash<>payload_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
  select * into receipt from public.card_sms_inbox i where i.id=prior.inbox_id;
  return jsonb_build_object('id',receipt.id,'status',receipt.state,'duplicate',true,'persisted',receipt.state='recorded');
 end if;
 if credential.minute_start<date_trunc('minute',now()) then credential.minute_count:=0; end if;
 if credential.day_start<>(now() at time zone 'UTC')::date then credential.day_count:=0; end if;
 if credential.minute_count>=10 or credential.day_count>=100 then return jsonb_build_object('error','rate_limited'); end if;
 -- Authenticated invalid messages also consume quota; returning errors preserves these counters.
 update public.card_sms_credentials c set minute_start=date_trunc('minute',now()),minute_count=credential.minute_count+1,
  day_start=(now() at time zone 'UTC')::date,day_count=credential.day_count+1,last_used_at=now() where c.id=credential.id;
 parsed:=public.parse_rcbc_purchase(p_sms,p_received_at);
 if parsed ? 'error' then return parsed; end if;
 if parsed->>'last4'<>credential.last4 then return jsonb_build_object('error','card_mismatch'); end if;
 select * into receipt from public.card_sms_inbox i where i.user_id=credential.user_id and i.account_id=credential.account_id
  and i.message_hash=parsed->>'message_hash' and i.receipt_year=(parsed->>'receipt_year')::integer;
 if found then is_duplicate:=true;
 else
  if (select count(*) from public.card_sms_inbox i where i.user_id=credential.user_id and i.state='needs_review')>=500 then return jsonb_build_object('error','inbox_full'); end if;
  possible:=exists(select 1 from public.transactions t where t.user_id=credential.user_id and t.account_id=credential.account_id and t.type='expense'
    and t.amount=(parsed->>'amount')::numeric and lower(trim(t.description))=lower(parsed->>'merchant')
    and (parsed->>'transaction_date' is null or t.date=(parsed->>'transaction_date')::date))
   or exists(select 1 from public.card_sms_inbox i where i.user_id=credential.user_id and i.account_id=credential.account_id and i.state<>'dismissed'
    and i.amount=(parsed->>'amount')::numeric and lower(i.merchant)=lower(parsed->>'merchant')
    and (i.transaction_date is null or parsed->>'transaction_date' is null or i.transaction_date=(parsed->>'transaction_date')::date));
  insert into public.card_sms_inbox(user_id,account_id,last4,merchant,amount,received_at,sms_date_label,transaction_date,date_issue,possible_duplicate,message_hash,receipt_year)
   values(credential.user_id,credential.account_id,credential.last4,parsed->>'merchant',(parsed->>'amount')::numeric,(parsed->>'received_at')::timestamptz,
    parsed->>'sms_date_label',(parsed->>'transaction_date')::date,parsed->>'date_issue',possible,parsed->>'message_hash',(parsed->>'receipt_year')::integer) returning * into receipt;
 end if;
 insert into public.card_sms_requests(credential_id,request_id,payload_hash,inbox_id) values(credential.id,p_request_id,payload_hash,receipt.id);
 return jsonb_build_object('id',receipt.id,'status',receipt.state,'duplicate',is_duplicate,'persisted',receipt.state='recorded');
end $$;
revoke all on function public.submit_card_sms(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_card_sms(text,uuid,text,text) to anon;

create or replace function public.review_card_sms(p_id uuid,p_revision integer,p_action text,p_values jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.card_sms_inbox; entry jsonb; result jsonb; duplicate_exists boolean;
begin
 if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into receipt from public.card_sms_inbox i where i.id=p_id and i.user_id=actor for update;
 if not found then raise exception 'Inbox item unavailable'; end if;
 if p_action='dismiss' then
  if receipt.state='dismissed' then return jsonb_build_object('status','dismissed','id',receipt.id); end if;
  if receipt.state<>'needs_review' or receipt.revision is distinct from p_revision then raise exception 'Inbox item changed' using errcode='40001'; end if;
  update public.card_sms_inbox set state='dismissed',revision=revision+1,reviewed_at=now() where id=receipt.id;
  return jsonb_build_object('status','dismissed','id',receipt.id);
 end if;
 if p_action<>'record' or receipt.state='dismissed' then raise exception 'Inbox item unavailable'; end if;
 if receipt.state='needs_review' and receipt.revision is distinct from p_revision then raise exception 'Inbox item changed' using errcode='40001'; end if;
 if jsonb_typeof(p_values) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('date','report_month','category_id','tag_ids','attribution','personal_amount','confirm_distinct')) then raise exception 'Invalid review'; end if;
 if p_values->>'attribution' is null or p_values->>'personal_amount' is null then raise exception 'Confirm personal share'; end if;
 if p_values->>'category_id' is not null and not exists(select 1 from public.categories c where c.id=(p_values->>'category_id')::uuid and c.user_id=actor and c.type='expense') then raise exception 'Invalid expense category'; end if;
 entry:=jsonb_build_object('account_id',receipt.account_id,'type','expense','amount',receipt.amount::text,'description',receipt.merchant,
  'date',p_values->>'date','report_month',p_values->>'report_month','category_id',p_values->'category_id','tag_ids',coalesce(p_values->'tag_ids','[]'),
  'attribution',p_values->>'attribution','personal_amount',p_values->>'personal_amount','review_status','reviewed',
  'wallet_id',null,'to_account_id',null,'bill_date',null,'paid_date',null);
 perform public.validate_workflow_entry(entry,actor);
 if receipt.state='needs_review' then
  duplicate_exists:=receipt.possible_duplicate or exists(select 1 from public.transactions t where t.user_id=actor and t.account_id=receipt.account_id
   and t.type='expense' and t.amount=receipt.amount and lower(trim(t.description))=lower(receipt.merchant) and t.date=(p_values->>'date')::date)
   or exists(select 1 from public.card_sms_inbox i where i.user_id=actor and i.account_id=receipt.account_id and i.id<>receipt.id and i.state<>'dismissed'
    and i.amount=receipt.amount and lower(i.merchant)=lower(receipt.merchant) and (i.transaction_date is null or i.transaction_date=(p_values->>'date')::date));
  if duplicate_exists and coalesce(p_values->>'confirm_distinct','false')<>'true' then raise exception 'Possible duplicate: confirm this is a separate purchase' using errcode='40001'; end if;
 end if;
 -- Stable receipt UUID makes review retries idempotent and rejects a changed retry payload.
 result:=public.commit_financial_operation(receipt.id,jsonb_build_object('action','create','entries',jsonb_build_array(entry)));
 if receipt.state='needs_review' then
  update public.card_sms_inbox set state='recorded',revision=revision+1,transaction_id=(result->0->>'id')::uuid,reviewed_at=now() where id=receipt.id;
 end if;
 return jsonb_build_object('status','recorded','id',receipt.id,'transaction_id',result->0->>'id');
end $$;
revoke all on function public.review_card_sms(uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.review_card_sms(uuid,integer,text,jsonb) to authenticated;
commit;
