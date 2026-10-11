-- AI parsing checkpoints only; no keys, account mappings, or ledger entries.
-- Depends on the activated quick-log schema and its existing scoped credential.
begin;
create table if not exists finance_private.ai_sms_requests (
 credential_id uuid not null references public.quick_log_credentials(id),
 request_id uuid not null, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 state jsonb not null default '{}', lease uuid, lease_until timestamptz,
 created_at timestamptz not null default now(),
 primary key(credential_id,request_id)
);
alter table finance_private.ai_sms_requests enable row level security;
revoke all on finance_private.ai_sms_requests from public,anon,authenticated,service_role;

create or replace function public.checkpoint_ai_sms(
 p_token text,p_request_id uuid,p_hash text,p_lease uuid,p_action text,p_state jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare credential public.quick_log_credentials; prior finance_private.ai_sms_requests;
begin
 if p_token is null or p_token !~ '^ft_quick_[a-f0-9]{64}$' then return jsonb_build_object('error','unauthorized'); end if;
 select * into credential from public.quick_log_credentials c
  where c.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return jsonb_build_object('error','unauthorized'); end if;
 perform pg_advisory_xact_lock(hashtextextended(credential.user_id::text,0));
 select * into credential from public.quick_log_credentials c where c.id=credential.id for update;
 if credential.revoked_at is not null or credential.expires_at<=now() then return jsonb_build_object('error','unauthorized'); end if;
 if p_request_id is null or p_lease is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
  or p_action not in ('claim','checkpoint','release') or p_action is null
  or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>8192
  or exists(select 1 from jsonb_object_keys(p_state) k where k not in ('purchase','retry','response')) then
  return jsonb_build_object('error','invalid_input');
 end if;
 select * into prior from finance_private.ai_sms_requests r where r.credential_id=credential.id and r.request_id=p_request_id;
 if found and prior.payload_hash<>p_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
 if p_action='claim' then
  if prior.state ? 'response' then return prior.state; end if;
  if prior.lease_until>now() then return jsonb_build_object('error','busy'); end if;
  -- Authentication and quotas happen before the paid AI call. These shared
  -- credential counters also bound preview/commit and unsupported SMS attempts.
  if credential.minute_start<date_trunc('minute',now()) then credential.minute_count:=0; end if;
  if credential.day_start<>(now() at time zone 'UTC')::date then credential.day_count:=0; end if;
  if credential.minute_count>=20 or credential.day_count>=200 then return jsonb_build_object('error','rate_limited'); end if;
  update public.quick_log_credentials c set minute_start=date_trunc('minute',now()),minute_count=credential.minute_count+1,
   day_start=(now() at time zone 'UTC')::date,day_count=credential.day_count+1,last_used_at=now() where c.id=credential.id;
  insert into finance_private.ai_sms_requests(credential_id,request_id,payload_hash,lease,lease_until)
   values(credential.id,p_request_id,p_hash,p_lease,now()+interval '150 seconds')
   on conflict(credential_id,request_id) do update set lease=excluded.lease,lease_until=excluded.lease_until;
  return coalesce(prior.state,'{}'::jsonb);
 end if;
 if prior.lease is distinct from p_lease or prior.lease_until<=now() or prior.lease_until is null then
  return jsonb_build_object('error','lease_lost');
 end if;
 if p_action='release' then
  update finance_private.ai_sms_requests r set lease=null,lease_until=null where r.credential_id=credential.id and r.request_id=p_request_id;
  return '{}';
 end if;
 -- A checkpoint is append-only: cannot change a parse, commit or final receipt.
 if exists(select 1 from jsonb_each(prior.state) e where not(p_state ? e.key) or p_state->e.key is distinct from e.value) then
  return jsonb_build_object('error','checkpoint_conflict');
 end if;
 update finance_private.ai_sms_requests r set state=p_state where r.credential_id=credential.id and r.request_id=p_request_id;
 return p_state;
end $$;
revoke all on function public.checkpoint_ai_sms(text,uuid,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.checkpoint_ai_sms(text,uuid,text,uuid,text,jsonb) to anon;
commit;
