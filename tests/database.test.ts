import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const a = "20000000-0000-4000-8000-000000000001",
  b = "20000000-0000-4000-8000-000000000002",
  foreign = "20000000-0000-4000-8000-000000000003";
test("real PostgreSQL migrations: balances, owner isolation, revisions, idempotency, reversal and undo", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create role authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
    );
    for (const migration of [
      "001_initial_schema.sql",
      "002_add_wallets.sql",
      "003_ledger_integrity.sql",
      "004_financial_operations.sql",
      "005_rebuildable_balances.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
    await db.exec(
      `insert into auth.users values('${owner}','{}'),('${other}','{}');select set_config('test.uid','${owner}',false);insert into accounts(id,user_id,name,type,balance) values('${a}','${owner}','Cash','cash',1000),('${b}','${owner}','Bank','bank',0),('${foreign}','${other}','Other','cash',1000);`,
    );
    const balance = async (id: string) =>
      (
        await db.query<{ balance: string }>(
          "select balance from accounts where id=$1",
          [id],
        )
      ).rows[0].balance;
    const commit = async (key: string, operation: unknown) =>
      (
        await db.query<{ result: unknown }>(
          "select commit_financial_operation($1,$2::jsonb) as result",
          [key, JSON.stringify(operation)],
        )
      ).rows[0].result;
    const entry = {
      account_id: a,
      category_id: null,
      wallet_id: null,
      type: "expense",
      amount: "100.25",
      description: "Test",
      date: "2026-10-01",
      report_month: "2026-10",
      attribution: "personal",
      personal_amount: "0",
      review_status: "pending",
      to_account_id: null,
    };
    const key = "30000000-0000-4000-8000-000000000001";
    const operation = { action: "create", entries: [entry] };
    const created = (await commit(key, operation)) as {
      id: string;
      revision: number;
    }[];
    assert.equal(await balance(a), "899.75");
    assert.deepEqual(await commit(key, operation), created);
    assert.equal(await balance(a), "899.75");
    await assert.rejects(() =>
      commit(key, { ...operation, entries: [{ ...entry, amount: "2" }] }),
    );
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000002", {
        action: "create",
        entries: [{ ...entry, account_id: foreign }],
      }),
    );
    assert.equal(await balance(foreign), "1000.00");
    await commit("30000000-0000-4000-8000-000000000003", {
      action: "amend",
      id: created[0].id,
      expected_revision: 1,
      entry: { ...entry, type: "transfer", to_account_id: b, amount: "150" },
    });
    assert.equal(await balance(a), "850.00");
    assert.equal(await balance(b), "150.00");
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000004", {
        action: "reverse",
        id: created[0].id,
        expected_revision: 1,
      }),
    );
    await commit("30000000-0000-4000-8000-000000000005", {
      action: "reverse",
      id: created[0].id,
      expected_revision: 2,
    });
    assert.equal(await balance(a), "1000.00");
    assert.equal(await balance(b), "0.00");
    const audit = (
      await db.query<{ id: number }>(
        "select id from financial_audit order by id desc limit 1",
      )
    ).rows[0];
    await commit("30000000-0000-4000-8000-000000000006", {
      action: "undo",
      id: created[0].id,
      expected_audit_id: String(audit.id),
    });
    assert.equal(await balance(a), "850.00");
    assert.equal(await balance(b), "150.00");
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000007", {
        action: "undo",
        id: created[0].id,
        expected_audit_id: String(audit.id),
      }),
    );
    const wallet = "40000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into wallets(id,user_id,name,balance) values($1,$2,$3,500)",
      [wallet, owner, "Envelope"],
    );
    const walletOp = {
      action: "create",
      entries: [{ ...entry, wallet_id: wallet }],
    };
    const walletRows = (await commit(
      "30000000-0000-4000-8000-000000000010",
      walletOp,
    )) as { id: string }[];
    assert.equal(
      (
        await db.query<{ balance: string }>(
          "select balance from wallets where id=$1",
          [wallet],
        )
      ).rows[0].balance,
      "399.75",
    );
    await commit("30000000-0000-4000-8000-000000000011", {
      action: "amend",
      id: walletRows[0].id,
      expected_revision: 1,
      entry: { ...entry, wallet_id: wallet, amount: "25" },
    });
    assert.equal(
      (
        await db.query<{ balance: string }>(
          "select balance from wallets where id=$1",
          [wallet],
        )
      ).rows[0].balance,
      "475.00",
    );
    const amendAudit = (
      await db.query<{ id: number }>(
        "select id from financial_audit order by id desc limit 1",
      )
    ).rows[0];
    const undoAmend = {
      action: "undo",
      id: walletRows[0].id,
      expected_audit_id: String(amendAudit.id),
    };
    const undone = await commit(
      "30000000-0000-4000-8000-000000000012",
      undoAmend,
    );
    assert.deepEqual(
      await commit("30000000-0000-4000-8000-000000000012", undoAmend),
      undone,
    );
    assert.equal(
      (
        await db.query<{ balance: string }>(
          "select balance from wallets where id=$1",
          [wallet],
        )
      ).rows[0].balance,
      "399.75",
    );
    const beforeBatch = await balance(a);
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000013", {
        action: "create",
        entries: [entry, { ...entry, account_id: foreign }],
      }),
    );
    assert.equal(await balance(a), beforeBatch);
    const recurring = "50000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into recurring_transactions(id,user_id,account_id,type,amount,description,frequency,next_date) values($1,$2,$3,'expense',10,'Monthly test','monthly','2026-01-31')",
      [recurring, owner, a],
    );
    await commit("30000000-0000-4000-8000-000000000014", {
      action: "post_recurring",
      id: recurring,
      expected_next_date: "2026-01-31",
      date: "2026-01-31",
    });
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000015", {
        action: "post_recurring",
        id: recurring,
        expected_next_date: "2026-01-31",
        date: "2026-01-31",
      }),
    );
    await commit("30000000-0000-4000-8000-000000000016", {
      action: "post_recurring",
      id: recurring,
      expected_next_date: "2026-02-28",
      date: "2026-02-28",
    });
    assert.equal(
      (
        await db.query<{ next_date: string }>(
          "select next_date::text from recurring_transactions where id=$1",
          [recurring],
        )
      ).rows[0].next_date,
      "2026-03-31",
    );
    const derived = (
      await db.query<{ derived_balance: string; cached_balance: string }>(
        "select derived_balance,cached_balance from ledger_account_balances where id=$1",
        [a],
      )
    ).rows[0];
    assert.equal(derived.derived_balance, derived.cached_balance);
    await assert.rejects(() =>
      db.query("update accounts set user_id=$1 where id=$2", [other, a]),
    );
    await db.exec(
      `grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated;select set_config('test.uid','${owner}',false)`,
    );
    assert.equal(
      (await db.query("select * from accounts where id=$1", [foreign])).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query("select * from financial_audit where user_id=$1", [
          other,
        ])
      ).rows.length,
      0,
    );
    await db.exec("delete from financial_requests");
    assert.ok(
      (await db.query("select * from financial_requests")).rows.length > 0,
    );
    await db.exec(`reset role;select set_config('test.uid','${other}',false)`);
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000008", {
        action: "reverse",
        id: created[0].id,
        expected_revision: 3,
      }),
    );
    await db.exec(`select set_config('test.uid','',false)`);
    await assert.rejects(() =>
      commit("30000000-0000-4000-8000-000000000009", operation),
    );
  } finally {
    await db.close();
  }
});
