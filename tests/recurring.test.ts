import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const owner='10000000-0000-4000-8000-000000000001', account='20000000-0000-4000-8000-000000000001', category='30000000-0000-4000-8000-000000000001';
test('automatic recurrence: calendar, retries, imported matches, reversal receipts, owner isolation and permissions',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create role anon;create role service_role;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`);
  for(const name of ['001_initial_schema','002_add_wallets','003_ledger_integrity','004_financial_operations','005_rebuildable_balances','006_financial_workflows','007_history_only_import','20261007035014_tags_and_planned_items','20261011000000_expense_time_category','20261012010000_automatic_recurring']) await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  await db.exec(`insert into auth.users values('${owner}','{}');select set_config('test.uid','${owner}',false);insert into accounts(id,user_id,name,type,balance) values('${account}','${owner}','Cash','cash',50000);insert into categories(id,user_id,name,type) values('${category}','${owner}','Fixed Expenses','expense');`);
  const schedule=async(desc:string,date:string,frequency='monthly',time:string|null=null)=> (await db.query<{id:string}>(`insert into recurring_transactions(user_id,account_id,category_id,type,amount,description,frequency,next_date,next_time) values($1,$2,$3,'expense',100,$4,$5,$6,$7) returning id`,[owner,account,category,desc,frequency,date,time])).rows[0].id;
  const post=async(id:string,date:string,asOf='2026-12-31 23:59:59')=>(await db.query<{result:{id:string;date:string;already_processed?:boolean}}>('select post_recurring_occurrence($1,$2,$3,$4) result',[owner,id,date,asOf])).rows[0].result;
  const next=async(id:string)=>(await db.query<{d:string}>('select next_date::text d from recurring_transactions where id=$1',[id])).rows[0].d;
  const count=async()=>(await db.query<{n:number}>('select count(*)::int n from transactions')).rows[0].n;
  const semi=await schedule('Contribution','2026-10-15','semimonthly','01:23');
  await assert.rejects(post(semi,'2026-10-15','2026-10-15 01:22:59'),/not due/);
  const first=await post(semi,'2026-10-15','2026-10-15 01:23');
  assert.equal(await next(semi),'2026-11-01');
  assert.equal((await post(semi,'2026-10-15')).id,first.id);assert.equal(await count(),1);
  await post(semi,'2026-11-01');assert.equal(await next(semi),'2026-11-15');
  await db.query('delete from transactions where id=$1',[first.id]);
  assert.equal((await post(semi,'2026-10-15')).already_processed,true);assert.equal(await count(),1);
  const monthly=await schedule('Month end','2026-01-31');await post(monthly,'2026-01-31');assert.equal(await next(monthly),'2026-02-28');await post(monthly,'2026-02-28');assert.equal(await next(monthly),'2026-03-31');
  const year=await schedule('Leap','2024-02-29','yearly');await post(year,'2024-02-29');assert.equal(await next(year),'2025-02-28');
  const matched=await schedule('Imported','2026-10-20');
  await db.exec(`insert into transactions(user_id,account_id,category_id,type,amount,description,date,report_month) values('${owner}','${account}','${category}','expense',100,' IMPORTED ','2026-10-20','2026-10');`);
  const before=await count();await post(matched,'2026-10-20');assert.equal(await count(),before);
  assert.equal((await db.query<{matched_existing:boolean}>('select matched_existing from recurring_occurrences where recurring_id=$1',[matched])).rows[0].matched_existing,true);
  await assert.rejects(db.query('select post_recurring_occurrence($1,$2,$3,$4)',['10000000-0000-4000-8000-000000000099',semi,'2026-11-15','2026-11-15']),/unavailable/);
  // Turn off the calendar fixtures; worker uses real Manila time, with synthetic overdue data only.
  await db.exec('update recurring_transactions set is_active=false');
  const overdue=await schedule('Catch up','2020-01-01','yearly');
  assert.ok((await db.query<{n:number}>('select process_due_recurring() n')).rows[0].n>1);
  const caughtUp=await count();assert.equal((await db.query<{n:number}>('select process_due_recurring() n')).rows[0].n,0);assert.equal(await count(),caughtUp);
  const invalid=await schedule('Invalid category','2020-01-01');
  await db.query('update recurring_transactions set category_id=null where id=$1',[invalid]);
  await assert.rejects(db.query('select process_due_recurring()'),/Choose a category/);
  assert.equal(await next(invalid),'2020-01-01');assert.equal(await count(),caughtUp);
  await db.query('update recurring_transactions set is_active=false where id=$1',[invalid]);
  assert.equal((await db.query<{n:number}>('select process_due_recurring() n')).rows[0].n,0);
  const future=await schedule('Future','2099-01-01');await assert.rejects(post(future,'2099-01-01'),/not due/);
  // A manual retry after cron has posted resolves to the same occurrence, even with a new request key.
  const manual=JSON.stringify({action:'post_recurring',id:overdue,expected_next_date:'2020-01-01',date:'2026-10-12'});
  await db.query('select commit_financial_operation(gen_random_uuid(),$1::jsonb)',[manual]);assert.equal(await count(),caughtUp);
  assert.equal((await db.query<{ok:boolean}>(`select has_function_privilege('authenticated','public.process_due_recurring()','execute') ok`)).rows[0].ok,false);
  assert.equal((await db.query<{ok:boolean}>(`select has_function_privilege('anon','public.post_recurring_occurrence(uuid,uuid,date,timestamp)','execute') ok`)).rows[0].ok,false);
  assert.equal((await db.query<{ok:boolean}>(`select has_table_privilege('authenticated','public.recurring_occurrences','insert') ok`)).rows[0].ok,false);
  assert.equal((await db.query<{n:number}>(`select count(*)::int n from transactions t where t.is_recurring and not exists(select 1 from financial_audit a where a.transaction_id=t.id)`)).rows[0].n,0);
 } finally {await db.close();}
});
