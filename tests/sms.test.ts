import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { handleCardSms } from '../lib/finance/sms/http';
const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const card='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const token='ft_sms_'+'a'.repeat(64),otherToken='ft_sms_'+'b'.repeat(64);
const sms=(date='10/07',time='3:38AM',merchant='SYNTHETIC MARKET',amount='123.45',last4='1234')=>`Your transaction at ${merchant} on ${date} ${time} for PHP${amount} using your Card ending in xxxx${last4} is approved.`;
async function fixture() {
 const db=new PGlite();
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create role anon;create role service_role;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
 for(const name of ['001_initial_schema','002_add_wallets','003_ledger_integrity','004_financial_operations','005_rebuildable_balances','006_financial_workflows','007_history_only_import','20261007035014_tags_and_planned_items','20261007070000_card_sms_inbox']) await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
 await db.exec(`insert into auth.users values('${owner}','{}'),('${other}','{}');select set_config('test.uid','${owner}',false);insert into accounts(id,user_id,name,type,balance) values('${card}','${owner}','Synthetic card','credit-card',0),('${foreign}','${other}','Other card','credit-card',0);grant usage on schema public,auth to authenticated,anon;`);
 async function key(value=token,account=card,last4='1234') {
  return (await db.query<{result:{id:string}}>('select manage_card_sms_credential($1,$2::jsonb) result',['create',JSON.stringify({account_id:account,last4,label:'Synthetic key',token_hash:createHash('sha256').update(value).digest('hex')})])).rows[0].result;
 }
 async function parse(text=sms(),received='2026-10-07T03:40:00+08:00',now='2026-10-07T03:41:00+08:00') {
  return (await db.query<{result:Record<string,unknown>}>('select parse_rcbc_purchase($1,$2,$3::timestamptz) result',[text,received,now])).rows[0].result;
 }
 async function submit(text=sms(),received='2026-10-07T03:40:00+08:00',id=randomUUID(),value=token) {
  return (await db.query<{result:Record<string,unknown>}>('select submit_card_sms($1,$2::uuid,$3,$4) result',[value,id,text,received])).rows[0].result;
 }
 async function review(id:string,values:Record<string,unknown>={},revision=1,action='record') {
  return (await db.query<{result:Record<string,unknown>}>('select review_card_sms($1,$2,$3,$4::jsonb) result',[id,revision,action,JSON.stringify({date:'2026-10-07',report_month:'2026-10',category_id:null,tag_ids:[],attribution:'personal',personal_amount:'123.45',confirm_distinct:false,...values})])).rows[0].result;
 }
 async function count(table:string) {return Number((await db.query<{n:string}>(`select count(*)::text n from ${table}`)).rows[0].n);}
 return {db,key,parse,submit,review,count};
}
test('RCBC parser keeps exact PHP and resolves only bounded Manila dates, including New Year',async()=>{
 const {db,parse}=await fixture();try{
 const p=await parse();assert.equal(p.amount,'123.45');assert.equal(p.merchant,'SYNTHETIC MARKET');assert.equal(p.last4,'1234');assert.equal(p.transaction_date,'2026-10-07');assert.equal(p.date_issue,null);
 assert.equal((await parse(sms('12/31','11:58PM'),'2027-01-01T00:02:00+08:00','2027-01-01T00:03:00+08:00')).transaction_date,'2026-12-31');
 assert.equal((await parse(sms('02/30'))).date_issue,'impossible_sms_date');
 assert.equal((await parse(sms('10/08'))).date_issue,'sms_date_unresolved');
 assert.equal((await parse(sms(),'2026-10-07T03:40:00+08:00','2026-10-15T03:41:00+08:00')).date_issue,'receipt_out_of_range');
 assert.equal((await parse(sms(),'2026-10-07T03:40:00')).error,'received_at_requires_offset');
 assert.equal((await parse(sms('10/07','12:00AM'))).transaction_date,'2026-10-07');
 assert.equal((await parse(sms('10/07','3:38AM','SYNTHETIC MARKET','1,234.50'))).amount,'1234.50');
 assert.equal((await parse(sms('10/07','3:38AM','SYNTHETIC MARKET','0.00'))).error,'invalid_amount');
 assert.equal((await parse(sms()+' If you don’t recognize this transaction, call 0288881888 immediately. You can also lock your Card using the RCBC Pulz app to prevent unauthorized transactions.')).merchant,'SYNTHETIC MARKET');
 for(const text of [sms().replace('approved','declined'),sms().replace('approved','pending'),'Your OTP is 123456.','Your payment has been received.',sms('10/07','3:38AM','REFUND'),sms('10/07','3:38AM','4111 1111 1111 1111'),sms()+' OTP 123456',sms().replace('xxxx1234','4111111111111111')]) assert.ok((await parse(text)).error, `Unexpected accepted synthetic case: ${text}`);
 }finally{await db.close();}
});
test('SMS scope, quota, replay and cross-key duplicates never write expenses',async()=>{
 const {db,key,submit,count}=await fixture();try{
 const credential=await key();await key(otherToken);
 await db.exec("set role anon; select set_config('test.uid','',false)");
 await assert.rejects(db.exec('select * from card_sms_credentials'),/permission denied/);
 await assert.rejects(db.exec('select * from card_sms_inbox'),/permission denied/);
 await assert.rejects(db.query('select parse_rcbc_purchase($1,$2)',[sms(),'2026-10-07T03:40:00+08:00']),/permission denied/);
 const request=randomUUID(),first=await submit(sms(),undefined,request);
 assert.equal(first.status,'needs_review');assert.equal(first.persisted,false);assert.equal((await submit(sms(),undefined,request)).id,first.id);
 assert.equal((await submit(sms(),undefined,randomUUID(),otherToken)).id,first.id);
 assert.equal((await submit(sms('10/07','3:39AM'),undefined,request)).error,'idempotency_conflict');
 assert.equal((await submit(sms('10/07','3:38AM','SYNTHETIC MARKET','123.45','9999'))).error,'card_mismatch');
 assert.equal((await submit(sms(),undefined,randomUUID(),'ft_sms_'+'c'.repeat(64))).error,'unauthorized');
 await db.exec('reset role');assert.equal(await count('transactions'),0);assert.equal(await count('card_sms_inbox'),1);
 const retained=(await db.query<{merchant:string}>('select merchant from card_sms_inbox')).rows[0];assert.equal(retained.merchant,'SYNTHETIC MARKET');
 await db.query('update card_sms_credentials set minute_count=10,minute_start=now() where id=$1',[credential.id]);assert.equal((await submit()).error,'rate_limited');
 await db.query('update card_sms_credentials set revoked_at=now() where id=$1',[credential.id]);assert.equal((await submit(sms(),undefined,request)).error,'unauthorized');
 }finally{await db.close();}
});
test('review is owner-only, audited and idempotent; late and ambiguous duplicates require confirmation',async()=>{
 const {db,key,submit,review,count}=await fixture();try{
 await key();const first=await submit();const second=await submit(sms('10/07','3:39AM'));
 assert.equal((await db.query<{possible_duplicate:boolean}>('select possible_duplicate from card_sms_inbox where id=$1',[second.id])).rows[0].possible_duplicate,true);
 await assert.rejects(review(String(first.id)),/Possible duplicate/);
 await db.exec(`select set_config('test.uid','${other}',false); set role authenticated;`);
 assert.equal(await count('card_sms_inbox'),0);
 await assert.rejects(review(String(first.id)),/unavailable/);
 await assert.rejects(key('ft_sms_'+'d'.repeat(64)),/owned active/);
 await db.exec(`reset role;select set_config('test.uid','${owner}',false);`);
 const result=await review(String(first.id),{confirm_distinct:true});assert.equal(result.status,'recorded');
 assert.deepEqual(await review(String(first.id),{confirm_distinct:true}),result);
 await assert.rejects(review(String(first.id),{date:'2026-10-06',confirm_distinct:true}),/Idempotency key reused/);
 assert.equal(await count('transactions'),1);assert.equal(await count('financial_audit'),1);
 assert.equal((await db.query<{amount:string}>('select amount::text from transactions')).rows[0].amount,'123.45');
 await assert.rejects(review(String(second.id),{account_id:foreign,confirm_distinct:true}),/Invalid review/);
 await assert.rejects(review(String(second.id),{date:'2026-02-30',confirm_distinct:true}),/out of range/);
 await assert.rejects(review(String(second.id),{personal_amount:'124.00',confirm_distinct:true}),/share/);
 await assert.rejects(review(String(second.id)),/Possible duplicate/);
 await review(String(second.id),{},1,'dismiss');assert.equal(await count('transactions'),1);
 await assert.rejects(review(String(second.id),{confirm_distinct:true}),/unavailable/);
 await db.exec('set role anon');await assert.rejects(review(String(first.id)),/permission denied/);
 }finally{await db.close();}
});
test('SMS HTTP boundary rejects missing auth, oversized/extra input, and hides backend errors',async()=>{
 const id=randomUUID();let calls=0;
 const invoke=async()=>{calls++;return {data:{id,status:'needs_review',duplicate:false,persisted:false},error:null};};
 const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://tracker.example/api/v1/card-transactions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Idempotency-Key':id,...headers},body:JSON.stringify(body)});
 assert.equal((await handleCardSms(request({sms:sms(),received_at:'2026-10-07T03:40:00+08:00'}),invoke)).status,202);
 assert.equal((await handleCardSms(request({}, {'Authorization':''}),invoke)).status,401);
 assert.equal((await handleCardSms(request({}, {'Origin':'https://foreign.example'}),invoke)).status,403);
 assert.equal((await handleCardSms(request({sms:'a'.repeat(5000)}),invoke)).status,413);
 assert.equal((await handleCardSms(request({sms:sms(),received_at:'2026-10-07T03:40:00',user_id:other}),invoke)).status,400);
 assert.equal(calls,1);
 const failed=await handleCardSms(request({sms:sms(),received_at:'2026-10-07T03:40:00Z'}),async()=>({data:null,error:{message:'secret database details'}}));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('secret'));
});
