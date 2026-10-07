import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { entrySchema } from "../lib/finance/core";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const bank = "20000000-0000-4000-8000-000000000001",
  card = "20000000-0000-4000-8000-000000000002",
  foreign = "20000000-0000-4000-8000-000000000003",
  wallet = "20000000-0000-4000-8000-000000000004";
async function fixture() {
  const db = new PGlite();
  await db.exec(
    `create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create role anon;create role service_role;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const name of [
    "001_initial_schema",
    "002_add_wallets",
    "003_ledger_integrity",
    "004_financial_operations",
    "005_rebuildable_balances",
    "006_financial_workflows",
    "007_history_only_import",
    "20261007035014_tags_and_planned_items",
  ])
    await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
  await db.exec(
    `insert into auth.users values('${owner}','{}'),('${other}','{}');select set_config('test.uid','${owner}',false);insert into accounts(id,user_id,name,type,balance) values('${bank}','${owner}','Bank','bank',1000),('${card}','${owner}','Card','credit-card',0),('${foreign}','${other}','Other','bank',1000);insert into wallets(id,user_id,name,balance) values('${wallet}','${owner}','Wallet',100);`,
  );
  const run = async <T = Record<string, unknown>>(
    operation: unknown,
    key = randomUUID(),
  ) =>
    (
      await db.query<{ result: T }>(
        "select commit_financial_operation($1,$2::jsonb) as result",
        [key, JSON.stringify(operation)],
      )
    ).rows[0].result;
  const scalar = async (sql: string) =>
    (await db.query<Record<string, string>>(sql)).rows[0];
  return { db, run, scalar };
}
const entry = (amount = "25", extra = {}) => ({
  account_id: bank,
  category_id: null,
  wallet_id: null,
  type: "expense",
  amount,
  description: "Test purchase",
  date: "2026-10-05",
  report_month: "2026-10",
  attribution: "personal",
  personal_amount: "0",
  review_status: "reviewed",
  to_account_id: null,
  ...extra,
});



test("tags create and amend atomically, preserve omitted tags, undo restores relations and retries do not duplicate", async()=>{
 const {db,run,scalar}=await fixture();try{
 const a=randomUUID(),b=randomUUID();await db.query("insert into tags(id,user_id,name) values($1,$3,'Food'),($2,$3,'Social')",[a,b,owner]);
 const key=randomUUID();const op={action:'create',entries:[entry('25.13',{tag_ids:[a,b]})]};
 const first=await run<{id:string;revision:number}[]>(op,key);assert.deepEqual(await run(op,key),first);
 const id=first[0].id;
 assert.equal((await scalar(`select count(*)::text n from transaction_tags where transaction_id='${id}'`)).n,'2');
 const balance=await scalar(`select balance::text,revision::text from accounts where id='${bank}'`);
 const changed=await run<{revision:number}>({action:'amend',id,expected_revision:1,entry:entry('25.13',{tag_ids:[b]})});
 assert.deepEqual(await scalar(`select balance::text,revision::text from accounts where id='${bank}'`),balance);
 const audit=await scalar(`select id::text from financial_audit where transaction_id='${id}' order by id desc limit 1`);
 await run({action:'undo',id,expected_audit_id:audit.id});
 assert.equal((await scalar(`select count(*)::text n from transaction_tags where transaction_id='${id}'`)).n,'2');
 await run({action:'amend',id,expected_revision:changed.revision+1,entry:entry('25.13')});
 assert.equal((await scalar(`select cardinality(tag_ids)::text n from transactions where id='${id}'`)).n,'2');
 await run({action:'reverse',id,expected_revision:changed.revision+2});
 assert.equal((await scalar(`select count(*)::text n from transaction_tags where transaction_id='${id}'`)).n,'0');
 const deletion=await scalar(`select id::text from financial_audit where transaction_id='${id}' order by id desc limit 1`);
 await run({action:'undo',id,expected_audit_id:deletion.id});
 assert.equal((await scalar(`select count(*)::text n from transaction_tags where transaction_id='${id}'`)).n,'2');
 }finally{await db.close();}
});
test("tag and plan owner isolation, fail-closed references, no posting or report side effects", async()=>{
 const {db,run,scalar}=await fixture();try{
 const tag=randomUUID();await db.query("insert into tags(id,user_id,name) values($1,$2,'Foreign')",[tag,other]);
 await assert.rejects(run({action:'create',entries:[entry('20',{tag_ids:[tag]})]}),/tag owner/);
 await assert.rejects(run({action:'create',entries:[entry('20',{tag_ids:[tag,tag]})]}),/tag list/);
 assert.equal(entrySchema.safeParse(entry('20',{tag_ids:[tag,tag]})).success,false);
 await assert.rejects(db.query("insert into planned_items(user_id,account_id,description,type,amount,source_date_label,source_ref,source) values($1,$2,'Synthetic plan','expense',100,'Oct 20','synthetic','{}')",[owner,foreign]),/foreign key/);
 await db.query("insert into planned_items(user_id,account_id,description,type,amount,source_date_label,source_ref,source) values($1,$2,'Synthetic plan','expense',100,'Oct 20','synthetic','{}')",[owner,bank]);
 assert.equal((await scalar('select count(*)::text n from transactions')).n,'0');
 assert.equal((await scalar('select count(*)::text n from recurring_transactions')).n,'0');
 assert.equal((await scalar('select cadence from planned_items')).cadence,null);
 await db.exec('grant usage on schema public,auth to authenticated; set role authenticated;');
 assert.equal((await scalar('select count(*)::text n from tags')).n,'0');
 await assert.rejects(db.query("insert into tags(user_id,name) values($1,'Spoof')",[other]),/row-level security/);
 await assert.rejects(db.exec("update planned_items set cadence='monthly'"),/permission denied/);
 await db.exec(`select set_config('test.uid','${other}',false)`);
 assert.equal((await scalar('select count(*)::text n from planned_items')).n,'0');
 assert.equal((await scalar('select count(*)::text n from transaction_tags')).n,'0');
 await db.exec('reset role; set role anon;');await assert.rejects(db.exec('select * from tags'),/permission denied/);
 }finally{await db.close();}
});
