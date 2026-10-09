-- Additive quick-log upgrade. No credentials or financial entries are created.
-- Apply after the quick-log activation migration. Existing preview/commit,
-- owner serialization, audit, duplicate review and retry contracts are retained.
begin;

create index if not exists quick_log_learning_history on public.transactions
 (user_id, lower(regexp_replace(trim(description), '[[:space:]]+', ' ', 'g')), date desc, created_at desc, id desc)
 where type='expense' and attribution='personal' and review_status='reviewed' and wallet_id is null;

create or replace function finance_private.parse_quick_log(p_text text,p_owner uuid,p_date date) returns jsonb
language plpgsql set search_path='' as $$
declare
 text_value text:=regexp_replace(trim(p_text),'[[:space:]]+',' ','g'); rest text; suffix text;
 account uuid; matches integer; tokens text[]; token text; number_text text; description_value text:=''; amount text; dates integer:=0;
 entry_date date:=p_date; category uuid; category_seen boolean:=false; tags uuid[]:='{}'; tag uuid; food_seen boolean:=false;
 quoted_category text[]; history jsonb; history_count integer; variants integer; category_hint text[];
 legacy_shorthand boolean:=text_value ~* '^exp ';
begin
 if text_value is null or octet_length(text_value)>1000 or length(text_value)=0 then return jsonb_build_object('error','description_required'); end if;
 if text_value ~* '\m(otp|cvv|cvc|password|pin|refund|repayment|payment|reversal|declined|pending|shared|reimbursable|installment|instalment|transfer|income|salary)\M'
    or text_value ~ '[0-9]([ -]?[0-9]){12,}' or text_value ~* 'one[ -]?time|cash advance|https?://' then return jsonb_build_object('error','unsupported_event'); end if;
 if text_value ~ '[$€£¥]' or text_value ~* '\m(USD|EUR|GBP|JPY|SGD|dollars?|euros?)\M' then return jsonb_build_object('error','currency_not_supported'); end if;
 rest:=regexp_replace(text_value,'^(exp|expense|log) ','','i');

 -- An explicitly named account always wins. Ambiguous names never fall back.
 select count(*),(array_agg(a.id))[1],max(a.name) into matches,account,suffix from public.accounts a
  where a.user_id=p_owner and not a.is_archived and lower(right(rest,length(a.name)+1))=' '||lower(a.name);
 if matches=0 and lower(right(rest,5))=' rcbc' then
  select count(*),(array_agg(a.id))[1] into matches,account from public.accounts a where a.user_id=p_owner and not a.is_archived and a.name ~* '^RCBC(\M|$)';
  suffix:='rcbc';
 end if;
 if matches>1 then return jsonb_build_object('error','account_ambiguous'); end if;
 if matches=1 then rest:=left(rest,length(rest)-length(suffix)-1); end if;

 -- Quoting permits existing category names such as category:"Food & Dining".
 quoted_category:=regexp_match(rest,'(?:^| )category:"([^"]+)"(?= |$)','i');
 if quoted_category is not null then
  category_seen:=true;
  select count(*),(array_agg(c.id))[1] into matches,category from public.categories c
   where c.user_id=p_owner and c.type='expense' and lower(c.name)=lower(quoted_category[1]);
  if matches<>1 then return jsonb_build_object('error','category_unavailable_or_ambiguous'); end if;
  rest:=trim(regexp_replace(rest,'(^| )category:"[^"]+"(?= |$)',' ','i'));
 end if;
 -- Join only currency markers adjacent to a number; the numeric grammar below
 -- still rejects signs, separators, excess decimals and multiple amounts.
 rest:=regexp_replace(rest,'\mPHP +(?=[0-9])','PHP','gi');
 rest:=regexp_replace(rest,'₱ +(?=[0-9])','₱','g');
 rest:=regexp_replace(rest,'([0-9]) +(pesos?|PHP)\M','\1\2','gi');
 tokens:=regexp_split_to_array(trim(rest),' +');
 foreach token in array tokens loop
  number_text:=regexp_replace(regexp_replace(token,'^(PHP|₱)','','i'),'(pesos?|PHP)$','','i');
  if number_text ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then
   if amount is not null then return jsonb_build_object('error','amount_ambiguous'); end if;
   if number_text::numeric<=0 then return jsonb_build_object('error','invalid_amount'); end if;
   amount:=to_char(number_text::numeric,'FM9999999990.00');
  elsif token ~ '^\d{4}-\d{2}-\d{2}$' then
   dates:=dates+1;if dates>1 then return jsonb_build_object('error','date_ambiguous'); end if;
   begin entry_date:=token::date; exception when others then return jsonb_build_object('error','invalid_date'); end;
  elsif token ~ '^[0-9]|^[-+]?[0-9]+[.,/]|^(₱|\$)' or token ~* '^PHP|^[+-][0-9]' or lower(token) in ('today','yesterday','tomorrow','pesos','peso') then
   return jsonb_build_object('error','use_exact_amount_and_full_date');
  elsif (legacy_shorthand and lower(token)='food') or left(token,1)='#' then
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
  else
   -- Do not silently treat an unknown account following the amount as a
   -- description and then charge a learned/default account instead.
   if amount is not null and account is null then return jsonb_build_object('error','account_required'); end if;
   description_value:=description_value||case when description_value='' then '' else ' ' end||token;
  end if;
 end loop;
 if amount is null then return jsonb_build_object('error','amount_required'); end if;
 if length(description_value) not between 1 and 300 then return jsonb_build_object('error','description_required'); end if;
 if entry_date is null or entry_date > (now() at time zone 'Asia/Manila')::date then return jsonb_build_object('error','invalid_date'); end if;

 -- Learn from up to five exact-description, reviewed personal expenses in the
 -- preceding 180 days. Amount is deliberately not part of the match and is
 -- never inferred. Deleted/reversed entries and pending imports do not teach.
 select coalesce(jsonb_agg(to_jsonb(h)),'[]') into history from (
  select t.account_id,t.category_id,array(select x from unnest(t.tag_ids) x order by x) tag_ids
  from public.transactions t join public.accounts a on a.id=t.account_id and a.user_id=p_owner and not a.is_archived
  where t.user_id=p_owner and t.type='expense' and t.attribution='personal' and t.review_status='reviewed' and t.wallet_id is null
   and lower(regexp_replace(trim(t.description),'[[:space:]]+',' ','g'))=lower(description_value)
   and t.date between entry_date-180 and entry_date
   and (account is null or t.account_id=account)
  order by t.date desc,t.created_at desc,t.id desc limit 5
 ) h;
 history_count:=jsonb_array_length(history);
 if account is null then
  if history_count>0 then
   select count(distinct h->>'account_id') into variants from jsonb_array_elements(history) h;
   if variants<>1 then return jsonb_build_object('error','account_ambiguous'); end if;
   account:=(history->0->>'account_id')::uuid;
  else
   select count(*),(array_agg(a.id))[1] into matches,account from public.accounts a where a.user_id=p_owner and not a.is_archived;
   if matches<>1 then return jsonb_build_object('error','account_required'); end if;
  end if;
 end if;
 if not category_seen and history_count>0 then
  select count(distinct coalesce(h->>'category_id','')) into variants from jsonb_array_elements(history) h;
  if variants<>1 then return jsonb_build_object('error','category_ambiguous'); end if;
  category:=(history->0->>'category_id')::uuid;
  if category is not null and not exists(select 1 from public.categories c where c.id=category and c.user_id=p_owner and c.type='expense') then
   return jsonb_build_object('error','category_unavailable_or_ambiguous');
  end if;
 end if;
 if cardinality(tags)=0 and history_count>0 then
  select count(distinct h->'tag_ids') into variants from jsonb_array_elements(history) h;
  if variants=1 then
   tags:=array(select value::uuid from jsonb_array_elements_text(history->0->'tag_ids'));
   if exists(select 1 from unnest(tags) x where not exists(select 1 from public.tags t where t.id=x and t.user_id=p_owner)) then return jsonb_build_object('error','tag_unavailable_or_ambiguous'); end if;
  end if;
 end if;

 -- Small, explicit vocabulary for obvious categories. Only existing owned
 -- categories qualify; competing matches require clarification. History wins.
 if category is null and not category_seen and history_count=0 then
  if description_value ~* '\m(badminton|basketball|tennis|volleyball|gym)\M' then
   category_hint:=array['sports','sports & fitness','fitness'];
   if not exists(select 1 from public.categories c where c.user_id=p_owner and c.type='expense' and lower(c.name)=any(category_hint)) then category_hint:=array['entertainment','recreation']; end if;
  elsif description_value ~* '\m(breakfast|lunch|dinner|coffee|restaurant)\M' then category_hint:=array['food & dining','food','dining'];
  elsif description_value ~* '\m(taxi|grab|jeepney|bus|train|mrt|lrt)\M' then category_hint:=array['transportation','transport'];
  elsif description_value ~* '\m(groceries|grocery|supermarket)\M' then category_hint:=array['groceries'];
  end if;
  if category_hint is not null then
   select count(*),(array_agg(c.id))[1] into matches,category from public.categories c where c.user_id=p_owner and c.type='expense' and lower(c.name)=any(category_hint);
   if matches>1 then return jsonb_build_object('error','category_ambiguous'); end if;
  end if;
 end if;
 return jsonb_build_object('account_id',account,'category_id',category,'tag_ids',to_jsonb(tags),'type','expense','amount',amount,'description',description_value,
  'date',entry_date,'report_month',to_char(entry_date,'YYYY-MM'),'attribution','personal','personal_amount',amount,'review_status','reviewed',
  'wallet_id',null,'to_account_id',null,'bill_date',null,'paid_date',null);
end $$;
revoke all on function finance_private.parse_quick_log(text,uuid,date) from public,anon,authenticated,service_role;
commit;
