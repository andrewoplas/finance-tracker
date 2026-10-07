import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {handleQuickLog} from '../lib/finance/quick-log/http';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const cash='20000000-0000-4000-8000-000000000001',card='20000000-0000-4000-8000-000000000002',foreign='20000000-0000-4000-8000-000000000003';
const food='30000000-0000-4000-8000-000000000001',token='ft_quick_'+'a'.repeat(64);
const migrations=['001_initial_schema','002_add_wallets','003_ledger_integrity','004_financial_operations','005_rebuildable_balances','006_financial_workflows','007_history_only_import','20261007035014_tags_and_planned_items','20261007070000_card_sms_inbox','20261007190256_quick_log'];
async function fixture(){
 const db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create role anon;create role service_role;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const name of migrations)await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
 await db.exec(`insert into auth.users values('${owner}','{}'),('${other}','{}');select set_config('request.jwt.claim.sub','${owner}',false);insert into accounts(id,user_id,name,type,balance) values('${cash}','${owner}','Cash','cash',0),('${card}','${owner}','RCBC Flex Visa','credit-card',0),('${foreign}','${other}','Other Bank','bank',0);insert into tags(id,user_id,name) values('${food}','${owner}','Food');grant usage on schema public,auth to authenticated,anon;grant select on transactions to authenticated;`);
 const key=(value=token)=>(db.query<{r:{id:string}}>('select manage_quick_log_credential($1,$2::jsonb) r',['create',JSON.stringify({label:'Synthetic client',token_hash:createHash('sha256').update(value).digest('hex')})]));
 const parse=async(text:string,date='2026-10-07')=>(await db.query<{r:Record<string,unknown>}>('select finance_private.parse_quick_log($1,$2::uuid,$3::date) r',[text,owner,date])).rows[0].r;
 const invoke=async(text:string,action='preview',id:string=randomUUID(),date:string|null=null,digest:string|null=null,value=token)=>(await db.query<{r:Record<string,unknown>}>('select submit_quick_log($1,$2::uuid,$3,$4,$5::date,$6) r',[value,id,text,action,date,digest])).rows[0].r;
 const count=async(table:string)=>Number((await db.query<{n:string}>(`select count(*)::text n from ${table}`)).rows[0].n);
 return {db,key,parse,invoke,count};
}
test('separate shorthand parser requires owned explicit account, exact amounts and safe explicit tags',async()=>{
 const {db,parse}=await fixture();try{
  const p=await parse('exp badminton food 210 cash');assert.equal(p.account_id,cash);assert.equal(p.description,'badminton');assert.equal(p.amount,'210.00');assert.deepEqual(p.tag_ids,[food]);assert.equal(p.category_id,null);assert.equal(p.date,'2026-10-07');
  const c=await parse('exp SYNTHETIC SHOP 12.30 2026-01-02 RCBC');assert.equal(c.account_id,card);assert.equal(c.date,'2026-01-02');assert.equal(c.amount,'12.30');
  assert.equal((await parse('exp lunch 210')).error,'account_required');
  assert.equal((await parse('exp lunch 210 Other Bank')).error,'account_required');
  for(const text of ['exp lunch 0 cash','exp lunch 1.234 cash','exp lunch 1,200 cash','exp lunch 210 99 cash','exp lunch 210 2026-02-30 cash','exp lunch 210 yesterday cash','exp refund 210 cash','exp repayment 210 cash','exp OTP 123456 cash','exp lunch #missing 210 cash','exp lunch category:missing 210 cash'])assert.ok((await parse(text)).error,text);
  await db.exec(`insert into accounts(user_id,name,type) values('${owner}','RCBC Savings','bank');`);assert.equal((await parse('exp lunch 210 rcbc')).error,'account_ambiguous');
  assert.equal((await parse('exp lunch 210 RCBC Flex Visa')).account_id,card);
 }finally{await db.close();}
});
test('quick log preview, expense scope, audited commit, duplicate inbox, review and revocation',async()=>{
 const {db,key,invoke,count}=await fixture();try{
  const credential=(await key()).rows[0].r;
  await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(db.exec('select * from quick_log_credentials'),/permission denied/);
  await assert.rejects(db.exec('select * from quick_log_inbox'),/permission denied/);
  await assert.rejects(db.query('select finance_private.parse_quick_log($1,$2::uuid,$3::date)',['exp lunch 210 cash',owner,'2026-10-07']),/permission denied/);
  const text='exp synthetic badminton food 210 cash',id=randomUUID(),p=await invoke(text,'preview',id);
  assert.equal(p.persisted,false);assert.deepEqual(p.summary,{account:'Cash',category:null,tags:['Food']});assert.equal((await invoke(text,'commit',id,String(p.date),'0'.repeat(64))).error,'preview_required');
  const saved=await invoke(text,'commit',id,String(p.date),String(p.digest));assert.equal(saved.persisted,true);assert.equal(saved.status,'recorded');
  assert.equal((await db.query<{uid:string|null}>('select auth.uid() uid')).rows[0].uid,null);
  assert.equal((await invoke(text,'commit',id,String(p.date),String(p.digest))).transaction_id,saved.transaction_id);
  assert.equal((await invoke('exp different 210 cash','commit',id,String(p.date),String(p.digest))).error,'idempotency_conflict');
  const p2=await invoke(text),held=await invoke(text,'commit',String(p2.request_id),String(p2.date),String(p2.digest));assert.equal(held.status,'needs_review');assert.equal(held.persisted,false);
  await db.exec('reset role');assert.equal(await count('transactions'),1);assert.equal(await count('financial_audit'),1);assert.equal(await count('quick_log_inbox'),1);
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);set role authenticated`);assert.equal(await count('quick_log_inbox'),0);
  await assert.rejects(db.query('select review_quick_log($1::uuid,1,$2,true)',[held.id,'record']),/unavailable/);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated`);
  await assert.rejects(db.query('select review_quick_log($1::uuid,1,$2,false)',[held.id,'record']),/separate expense/);
  const reviewed=(await db.query<{r:{transaction_id:string}}>('select review_quick_log($1::uuid,1,$2,true) r',[held.id,'record'])).rows[0].r;assert.ok(reviewed.transaction_id);
  await db.query('select review_quick_log($1::uuid,1,$2,true)',[held.id,'record']);assert.equal(await count('transactions'),2);
  await db.query('select manage_quick_log_credential($1,$2::jsonb)',['revoke',JSON.stringify({id:credential.id})]);
  await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)");assert.equal((await invoke(text,'commit',id,String(p.date),String(p.digest))).error,'unauthorized');
  assert.equal((await invoke(text,'preview',randomUUID(),null,null,'ft_sms_'+'a'.repeat(64))).error,'unauthorized');
 }finally{await db.close();}
});
test('new migrations are repeatable and public roles cannot reach private save or tables',async()=>{
 const {db,count}=await fixture();try{
  for(const name of migrations.slice(-2))await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  assert.equal(await count('transactions'),0);
  const result=await db.query<{enabled:boolean;rls:boolean}>(`select has_function_privilege('anon','finance_private.save_expense(uuid,uuid,jsonb)','execute') enabled,relrowsecurity rls from pg_class where oid='quick_log_inbox'::regclass`);
  assert.equal(result.rows[0].enabled,false);assert.equal(result.rows[0].rls,true);
 }finally{await db.close();}
});
test('quick-log HTTP rejects wrong scope, unknown fields, size and invalid receipts; redacts errors',async()=>{
 let calls=0;const id=randomUUID();const request=(body:unknown,key=token)=>new Request('https://tracker.example/api/v1/quick-log',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`,'Idempotency-Key':id},body:JSON.stringify(body)});
 const invoke=async()=>{calls++;return {data:{error:'account_required'},error:null};};
 assert.equal((await handleQuickLog(request({text:'exp lunch 210',action:'preview'}),invoke)).status,422);
 assert.equal((await handleQuickLog(request({text:'exp lunch 210 cash',action:'preview'},'ft_sms_'+'a'.repeat(64)),invoke)).status,401);
 assert.equal((await handleQuickLog(request({text:'exp lunch 210 cash',action:'commit'}),invoke)).status,400);
 assert.equal((await handleQuickLog(request({text:'a'.repeat(10000),action:'preview'}),invoke)).status,413);
 assert.equal((await handleQuickLog(request({text:'exp lunch 210 cash',action:'preview',owner}),invoke)).status,400);
 assert.equal(calls,1);
 const bad=await handleQuickLog(request({text:'exp lunch 210 cash',action:'preview'}),async()=>({data:null,error:{message:'SENSITIVE SQL'}}));assert.equal(bad.status,503);assert.ok(!(await bad.text()).includes('SENSITIVE'));
 const impossible=await handleQuickLog(request({text:'exp lunch 210 cash',action:'commit',date:'2026-10-07',digest:'a'.repeat(64)}),async()=>({data:{id,status:'recorded',persisted:true,duplicate:false},error:null}));assert.equal(impossible.status,503);
});
