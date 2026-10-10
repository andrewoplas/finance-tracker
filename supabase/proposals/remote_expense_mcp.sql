-- REVIEW ONLY. Not an activation migration. Never run against production without
-- separate approval. Requires repository core schema through tags/planned items;
-- independent of SMS and quick-log credential migrations. Tests use PGlite only.
begin;
create schema if not exists finance_private;
revoke all on schema finance_private from public, anon, authenticated, service_role;
-- Refuse a preexisting role rather than trusting unknown memberships/grants.
create role finance_mcp nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant finance_mcp to authenticator;
grant usage on schema public, finance_private to finance_mcp;
-- Future functions created by this migration owner must opt into API access.
alter default privileges in schema public revoke execute on functions from public;

-- No rows are provisioned by this proposal. Mapping one owner + OAuth client
-- to a stable integration and resource is a separately approved access grant.
create table finance_private.mcp_integrations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id), client_id uuid not null,
 resource text not null check(resource ~ '^https://[^/?#]+/api/mcp/expenses$'),
 issuer text not null check(issuer ~ '^https://[^/?#]+/auth/v1$'),
 enabled boolean not null default false, expires_at timestamptz not null,
 valid_after timestamptz not null default now(),
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 day_start date not null default current_date, day_count integer not null default 0,
 unique(user_id,client_id)
);
create table finance_private.mcp_requests (
 user_id uuid not null references public.profiles(id), integration_id uuid not null references finance_private.mcp_integrations(id),
 request_id uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,integration_id,request_id)
);
alter table finance_private.mcp_integrations enable row level security;
alter table finance_private.mcp_requests enable row level security;
revoke all on all tables in schema finance_private from public, anon, authenticated, service_role, finance_mcp;

-- Restrictive policies are ANDed with every permissive owner policy. OAuth
-- tokens accidentally issued as authenticated cannot reuse broad owner access.
do $$ declare t record; f record; definition text; guarded text; begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions @> array['security_invoker=true'],false)) then
  raise exception 'Review owner-rights views before OAuth activation';
 end if;
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') loop
  execute format('alter table public.%I enable row level security',t.relname);
  execute format('create policy mcp_deny_oauth on public.%I as restrictive for all to public using ((select auth.jwt()->>''client_id'') is null) with check ((select auth.jwt()->>''client_id'') is null)',t.relname);
 end loop;
 -- Definer RPCs bypass RLS, so they require a separate guard. Preserve OIDs,
 -- existing grants, signatures and dependencies, wrapping each existing body.
 -- Trigger functions cannot be called as RPCs and still audit/update balances.
 for f in select p.oid,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype loop
  if f.lanname<>'plpgsql' then raise exception 'Review non-plpgsql definer RPC before OAuth activation'; end if;
  definition:=pg_get_functiondef(f.oid);
  guarded:='begin if auth.jwt()->>''client_id'' is not null then raise exception ''OAuth client cannot use owner RPC'' using errcode=''42501''; end if; '||rtrim(f.prosrc,E' \n\r\t;')||'; end;';
  execute replace(definition,f.prosrc,guarded);
 end loop;
 -- PUBLIC execute is inherited even by a dedicated role. Remove that implicit
 -- access while preserving legacy direct-session access. Explicit anon grants
 -- on the SMS/quick-log endpoints, if present, remain unchanged.
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('finance_mcp',p.oid,'execute') loop
  execute format('revoke execute on function %s from public, finance_mcp',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Enable as a Custom Access Token Hook only after separate approval. Provider
-- client_id is trusted hook input; never read user_metadata for authorization.
create function finance_private.mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=event->'claims'; client text:=coalesce(event->>'client_id',event->'claims'->>'client_id');
 integration finance_private.mcp_integrations;
begin
 if client is null then
  if event->>'authentication_method'='oauth_provider/authorization_code' or claims->>'role'='finance_mcp' then
   raise exception 'Missing OAuth client identity';
  end if;
  return jsonb_build_object('claims',claims);
 end if;
 select * into integration from finance_private.mcp_integrations i
 where i.user_id=(claims->>'sub')::uuid and i.client_id=client::uuid and i.enabled and i.expires_at>now();
 if not found or claims->>'iss' is distinct from integration.issuer then raise exception 'OAuth integration not authorized'; end if;
 claims:=claims||jsonb_build_object('client_id',client,'role','finance_mcp','aud','authenticated',
  'finance_mcp_resource',integration.resource,'finance_mcp_permissions',jsonb_build_array('expense:read','expense:write'));
 return jsonb_build_object('claims',claims);
end $$;
revoke all on function finance_private.mcp_access_token_hook(jsonb) from public, anon, authenticated, service_role, finance_mcp;
grant usage on schema finance_private to supabase_auth_admin;
grant execute on function finance_private.mcp_access_token_hook(jsonb) to supabase_auth_admin;

-- The only remotely reachable definer body is in a non-exposed schema. It
-- validates signed claims AND live owner/client/session/consent on every call.
create function finance_private.remote_expense(p_action text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<expense_body>>
declare
 actor uuid:=auth.uid(); claims jsonb:=auth.jwt(); integration finance_private.mcp_integrations;
 previous finance_private.mcp_requests; request_id uuid; expense jsonb; canonical jsonb; retry jsonb;
 account public.accounts; category public.categories; day date; amount numeric(12,2); tags uuid[];
 duplicates jsonb; digest text; receipt jsonb; saved uuid; decision text; today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if actor is null or claims->>'role' is distinct from 'finance_mcp' or claims->>'aud' is distinct from 'authenticated'
  or claims->>'is_anonymous' is distinct from 'false'
  or not coalesce(claims->'finance_mcp_permissions' @> '["expense:read","expense:write"]'::jsonb,false)
  or coalesce((claims->>'exp')::numeric,0)<=extract(epoch from now())
  or coalesce((claims->>'iat')::numeric,0)>extract(epoch from now())
  or coalesce((claims->>'iat')::numeric,0)<extract(epoch from now()-interval '1 hour')
  or coalesce((claims->>'nbf')::numeric,0)>extract(epoch from now()) then return jsonb_build_object('error','unauthorized'); end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into integration from finance_private.mcp_integrations i where i.user_id=actor and i.client_id=(claims->>'client_id')::uuid for update;
 if not found or not integration.enabled or integration.expires_at<=now()
  or claims->>'iss' is distinct from integration.issuer or claims->>'finance_mcp_resource' is distinct from integration.resource
  or (claims->>'iat')::numeric<floor(extract(epoch from integration.valid_after))
  or not exists(select 1 from auth.sessions s where s.id=(claims->>'session_id')::uuid and s.user_id=actor and s.oauth_client_id=integration.client_id and (s.not_after is null or s.not_after>now()))
  or not exists(select 1 from auth.oauth_consents c where c.user_id=actor and c.client_id=integration.client_id and c.revoked_at is null)
  or not exists(select 1 from auth.oauth_clients c where c.id=integration.client_id and c.deleted_at is null)
 then return jsonb_build_object('error','unauthorized'); end if;
 if p_action='authorize' then return jsonb_build_object('authorized',true); end if;
 if p_action not in ('context','preview','commit') or jsonb_typeof(p_args) is distinct from 'object' then return jsonb_build_object('error','invalid_request'); end if;
 if p_action='commit' then
  request_id:=(p_args->>'request_id')::uuid;
  select * into previous from finance_private.mcp_requests r where r.user_id=actor and r.integration_id=integration.id and r.request_id=expense_body.request_id;
  if found then
   if previous.payload is distinct from p_args then return jsonb_build_object('error','idempotency_conflict'); end if;
   return previous.result;
  end if;
 end if;
 -- Persistent quotas shared across instances. Exact completed retries are free.
 if integration.minute_start<=now()-interval '1 minute' then integration.minute_start:=now();integration.minute_count:=0;end if;
 if integration.day_start<>today then integration.day_start:=today;integration.day_count:=0;end if;
 if integration.minute_count>=60 or integration.day_count>=500 then return jsonb_build_object('error','rate_limited','retry_after',60);end if;
 update finance_private.mcp_integrations set minute_start=integration.minute_start,minute_count=integration.minute_count+1,day_start=integration.day_start,day_count=integration.day_count+1 where id=integration.id;
 if p_action='context' then
  if p_args<>'{}' then return jsonb_build_object('error','invalid_request');end if;
  if (select count(*) from public.accounts where user_id=actor and not is_archived)>200
   or (select count(*) from public.categories where user_id=actor and type='expense')>200
   or (select count(*) from public.tags where user_id=actor)>200 then return jsonb_build_object('error','context_limit');end if;
  return jsonb_build_object('currency','PHP','timezone','Asia/Manila','today',today,
   'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') from public.accounts where user_id=actor and not is_archived),
   'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') from public.categories where user_id=actor and type='expense'),
   'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]') from public.tags where user_id=actor));
 end if;
 if exists(select 1 from jsonb_object_keys(p_args) k where k not in ('request_id','expense','duplicate_decision','digest','intent'))
  or p_args->>'request_id' is null or jsonb_typeof(p_args->'expense') is distinct from 'object'
  or (p_action='preview' and (p_args ? 'intent' or p_args ? 'digest'))
  or (p_action='commit' and p_args->>'intent' is distinct from 'log_expense') then return jsonb_build_object('error','invalid_request');end if;
 request_id:=(p_args->>'request_id')::uuid; expense:=p_args->'expense'; decision:=coalesce(p_args->>'duplicate_decision','review');
 if decision not in ('review','confirmed_separate') or exists(select 1 from jsonb_object_keys(expense) k where k not in ('account_id','amount','description','date','category_id','tag_ids')) then return jsonb_build_object('error','invalid_expense');end if;
 if expense->>'account_id' is null then return jsonb_build_object('error','account_required');end if;
 select * into account from public.accounts a where a.id=(expense->>'account_id')::uuid and a.user_id=actor and not a.is_archived for share;
 if not found then return jsonb_build_object('error','account_unavailable');end if;
 if jsonb_typeof(expense->'amount') is distinct from 'string' or coalesce(expense->>'amount','') !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then return jsonb_build_object('error','exact_php_amount_required');end if;
 amount:=(expense->>'amount')::numeric;
 if amount<=0 then return jsonb_build_object('error','positive_amount_required');end if;
 if jsonb_typeof(expense->'description') is distinct from 'string' or length(trim(expense->>'description')) not between 1 and 300 then return jsonb_build_object('error','description_required');end if;
 if expense->>'description' ~* '\m(otp|cvv|cvc|password|refund|payment|repayment|reversal|declined|pending|shared|reimbursable|installment|transfer|income|salary)\M' or expense->>'description' ~ '[0-9]([ -]?[0-9]){12,}' then return jsonb_build_object('error','unsupported_event');end if;
 if p_action='commit' and expense->>'date' is null then return jsonb_build_object('error','preview_required');end if;
 if expense ? 'date' then
  if coalesce(expense->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('error','full_date_required');end if;
  begin day:=(expense->>'date')::date; exception when others then return jsonb_build_object('error','invalid_date');end;
 else day:=today;end if;
 if day>today or to_char(day,'YYYY-MM-DD') is distinct from coalesce(expense->>'date',today::text) then return jsonb_build_object('error','invalid_date');end if;
 if expense->>'category_id' is not null then
  select * into category from public.categories c where c.id=(expense->>'category_id')::uuid and c.user_id=actor and c.type='expense' for share;
  if not found then return jsonb_build_object('error','category_unavailable');end if;
 end if;
 if jsonb_typeof(coalesce(expense->'tag_ids','[]'))<>'array' or jsonb_array_length(coalesce(expense->'tag_ids','[]'))>50 then return jsonb_build_object('error','invalid_tags');end if;
 tags:=array(select value::uuid from jsonb_array_elements_text(coalesce(expense->'tag_ids','[]')) order by value);
 if cardinality(tags)<>(select count(distinct t) from unnest(tags) t) or exists(select 1 from unnest(tags) t where not exists(select 1 from public.tags x where x.id=t and x.user_id=actor)) then return jsonb_build_object('error','tag_unavailable');end if;
 canonical:=jsonb_build_object('account_id',account.id,'amount',to_char(amount,'FM9999999990.00'),'description',trim(expense->>'description'),'date',day,'category_id',category.id,'tag_ids',to_jsonb(tags));
 select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') into duplicates from (
  select t.id,t.description,to_char(t.amount,'FM9999999990.00') amount,t.date from public.transactions t
  where t.user_id=actor and t.account_id=account.id and t.type='expense' and t.amount=expense_body.amount and t.date between day-1 and day+1 order by t.id limit 11
 ) d;
 if jsonb_array_length(duplicates)>10 then return jsonb_build_object('error','duplicate_review_limit');end if;
 -- Hash binds tenant, integration, request, resolved date, taxonomy and current
 -- duplicates. It is an integrity check, never evidence of user consent.
 digest:=encode(sha256(convert_to(jsonb_build_object('owner',actor,'integration',integration.id,'request',request_id,'expense',canonical,'decision',decision,'duplicates',duplicates,'account_name',account.name,'category_name',category.name)::text,'UTF8')),'hex');
 retry:=jsonb_build_object('request_id',request_id,'expense',canonical,'duplicate_decision',decision,'digest',digest,'intent','log_expense');
 if p_action='preview' then return jsonb_build_object('persisted',false,'retry',retry,'duplicates',duplicates,'summary',jsonb_build_object('account',account.name,'category',category.name,'currency','PHP','timezone','Asia/Manila'));end if;
 if p_args->>'digest' is distinct from digest or expense is distinct from canonical then return jsonb_build_object('error','preview_required_or_stale');end if;
 if jsonb_array_length(duplicates)>0 and decision='review' then
  receipt:=jsonb_build_object('status','needs_review','persisted',false,'request_id',request_id,'duplicates',duplicates);
 else
  -- A narrow insert retains existing ownership/integrity, audit and balance
  -- triggers. No forged claims, service key or general-purpose owner RPC.
  insert into public.transactions(user_id,account_id,category_id,type,amount,description,date,report_month,attribution,personal_amount,review_status,tag_ids)
  values(actor,account.id,category.id,'expense',amount,canonical->>'description',day,to_char(day,'YYYY-MM'),'personal',amount,'reviewed',tags) returning id into saved;
  receipt:=jsonb_build_object('status','recorded','persisted',true,'transaction_id',saved,'request_id',request_id,'expense',canonical);
 end if;
 insert into finance_private.mcp_requests(user_id,integration_id,request_id,payload,result) values(actor,integration.id,request_id,p_args,receipt);
 return receipt;
end $$;
revoke all on function finance_private.remote_expense(text,jsonb) from public, anon, authenticated, service_role, finance_mcp;
grant execute on function finance_private.remote_expense(text,jsonb) to finance_mcp;
create function public.remote_expense(p_action text,p_args jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select finance_private.remote_expense(p_action,p_args) $$;
revoke all on function public.remote_expense(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.remote_expense(text,jsonb) to finance_mcp;
create index mcp_duplicate_candidates on public.transactions(user_id,account_id,amount,date) where type='expense';
commit;
