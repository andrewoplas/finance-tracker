import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { monthlyReport } from "../lib/finance/core";
import { withVerifiedBalance } from "../lib/finance/balances";
import { requestSchema } from "../lib/finance/contracts";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const bank = "20000000-0000-4000-8000-000000000001",
  card = "20000000-0000-4000-8000-000000000002",
  foreign = "20000000-0000-4000-8000-000000000003",
  wallet = "20000000-0000-4000-8000-000000000004";
async function fixture() {
  const db = new PGlite();
  await db.exec(
    `create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const name of [
    "001_initial_schema",
    "002_add_wallets",
    "003_ledger_integrity",
    "004_financial_operations",
    "005_rebuildable_balances",
    "006_financial_workflows",
    "007_history_only_import",
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


test("history import retains unknown balances, audited source, pending attribution and exact reports; retries are safe", async () => {
 const { db, run, scalar } = await fixture();
 try {
 const history = randomUUID();
 await db.query("insert into accounts(id,user_id,name,type,opening_balance_unknown) values($1,$2,'History','cash',true)",[history,owner]);
 assert.equal((await scalar(`select opening_balance from accounts where id='${history}'`)).opening_balance,null);
 assert.equal((await scalar(`select count(*)::text as n from balance_reconciliations where target_id='${history}'`)).n,'0');
 const source = 'Synthetic original source';
 const batch = await run<{id:string}>({action:'stage_import',name:'History',rows:[{source_row:1,source,entry:entry('25.13',{account_id:history})},{source_row:2,source:'held',entry:null}]});
 const op={action:'commit_import',mode:'history_only',id:batch.id,expected_revision:1,decisions:[{source_row:1,decision:'include'},{source_row:2,decision:'skip'}],closing_balances:[]};
 const key=randomUUID(); requestSchema.parse({request_id:key,operation:op});
 const first = await run(op,key); assert.deepEqual(await run(op,key),first);
 await assert.rejects(run({...op,mode:'reconciled'},key),/Idempotency/);
 const account=(await db.query<{balance:string;opening_balance:null;reconciliation_status:string}>(`select * from accounts where id='${history}'`)).rows[0];
 assert.equal(withVerifiedBalance(account).balance,null); assert.equal(account.reconciliation_status,'unknown');
 assert.equal((await scalar(`select derived_balance from ledger_account_balances where id='${history}'`)).derived_balance,null);
 const rows=(await db.query<import("../lib/finance/core").LedgerEntry>(`select * from transactions where account_id='${history}'`)).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].review_status,'pending');assert.equal(rows[0].type,'expense');
 const report=monthlyReport(rows.map(r=>({...r,amount:String(r.amount),personal_amount:String(r.personal_amount)})),'2026-10');
 assert.equal(report.spending,2513);
 assert.equal((await scalar(`select rows->0->>'source' as source from import_batches where id='${batch.id}'`)).source,source);
 assert.equal((await scalar(`select count(*)::text as n from financial_audit where transaction_id='${rows[0].id}'`)).n,'1');
 } finally {await db.close();}
});
test("history mode enforces ownership, unknown baselines, duplicate review and strict mode remains strict",async()=>{
 const {db,run,scalar}=await fixture();
 try{
 const history=randomUUID(); await db.query("insert into accounts(id,user_id,name,type,opening_balance_unknown) values($1,$2,'History','cash',true)",[history,owner]);
 const stage=async(account_id:string)=>run<{id:string;rows:{status:string}[]}>({action:'stage_import',name:'Test',rows:[{source_row:1,source:'test',entry:entry('10',{account_id})}]});
 const op=(id:string,mode='history_only')=>({action:'commit_import',mode,id,expected_revision:1,decisions:[{source_row:1,decision:'include'}],closing_balances:[]});
 const known=await stage(bank);await assert.rejects(run(op(known.id)),/unknown opening/);
 const foreignBatch=await stage(foreign);assert.equal(foreignBatch.rows[0].status,'exception');await assert.rejects(run(op(foreignBatch.id)),/Exception/);
 const batch=await stage(history);await assert.rejects(run(op(batch.id,'reconciled')),/Closing statement/);
 await db.exec(`select set_config('test.uid','${other}',false)`);await assert.rejects(run(op(batch.id)),/Batch changed/);
 await db.exec(`select set_config('test.uid','${owner}',false)`);await run(op(batch.id));
 const duplicate=await stage(history);await assert.rejects(run(op(duplicate.id)),/Duplicate/);
 assert.equal((await scalar(`select count(*)::text as n from transactions where account_id='${history}'`)).n,'1');
 }finally{await db.close();}
});
