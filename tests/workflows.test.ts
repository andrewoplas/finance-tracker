import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { monthlyReport, type LedgerEntry } from "../lib/finance/core";
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

test("persisted import reviews exceptions, rolls back all rows on mismatch, and deduplicates retries", async () => {
  const { db, run, scalar } = await fixture();
  try {
    const batch = await run<{
      id: string;
      revision: number;
      rows: { status: string }[];
    }>({
      action: "stage_import",
      name: "Synthetic.csv",
      rows: [
        { source_row: 1, source: "first", entry: entry() },
        { source_row: 2, source: "duplicate", entry: entry() },
        {
          source_row: 3,
          source: "second",
          entry: entry("50", { description: "Another" }),
        },
        { source_row: 4, source: "unmapped", entry: null },
      ],
    });
    assert.deepEqual(
      batch.rows.map((r) => r.status),
      ["ready", "duplicate", "ready", "exception"],
    );
    const op = {
      action: "commit_import",
      id: batch.id,
      expected_revision: 1,
      decisions: [
        { source_row: 1, decision: "include" },
        { source_row: 2, decision: "skip" },
        { source_row: 3, decision: "include" },
        { source_row: 4, decision: "skip" },
      ],
      closing_balances: [
        { account_id: bank, as_of_date: "2026-10-31", balance: "899" },
      ],
    };
    await assert.rejects(() => run(op), /Closing balance mismatch/);
    assert.equal(
      (await scalar("select count(*)::text as n from transactions")).n,
      "0",
    );
    assert.equal(
      (await scalar(`select state from import_batches where id='${batch.id}'`))
        .state,
      "staged",
    );
    await assert.rejects(
      () =>
        run({
          ...op,
          decisions: op.decisions.map((d) =>
            d.source_row === 4 ? { ...d, decision: "include" } : d,
          ),
        }),
      /Exception rows/,
    );
    assert.equal(
      (await scalar("select count(*)::text as n from transactions")).n,
      "0",
    );
    op.closing_balances[0].balance = "925";
    const key = randomUUID();
    const result = await run(op, key);
    assert.deepEqual(await run(op, key), result);
    assert.equal(
      (await scalar("select count(*)::text as n from transactions")).n,
      "2",
    );
    await assert.rejects(() => run(op), /already committed/);
    const late = await run<{ id: string }>({
      action: "stage_import",
      name: "Late duplicate.csv",
      rows: [
        {
          source_row: 1,
          source: "race candidate",
          entry: entry("1", { description: "Late arrival" }),
        },
      ],
    });
    await run({
      action: "create",
      entries: [entry("1", { description: "Late arrival" })],
    });
    await assert.rejects(
      () =>
        run({
          ...op,
          id: late.id,
          decisions: [{ source_row: 1, decision: "include" }],
        }),
      /Duplicate found/,
    );
    const repeat = await run<{
      id: string;
      rows: { status: string; matches: unknown[] }[];
    }>({
      action: "stage_import",
      name: "Repeated.csv",
      rows: [{ source_row: 1, source: "first", entry: entry() }],
    });
    assert.equal(repeat.rows[0].status, "duplicate");
    assert.equal(repeat.rows[0].matches.length, 1);
    await assert.rejects(
      () =>
        run({
          ...op,
          id: repeat.id,
          decisions: [{ source_row: 1, decision: "include" }],
        }),
      /Duplicate found/,
    );
    await run({
      ...op,
      id: repeat.id,
      decisions: [{ source_row: 1, decision: "include_duplicate" }],
      closing_balances: [
        { account_id: bank, as_of_date: "2026-10-31", balance: "899" },
      ],
    });
    assert.equal(
      (await scalar(`select balance::text from accounts where id='${bank}'`))
        .balance,
      "899.00",
    );
  } finally {
    await db.close();
  }
});

test("installments preserve liability, allocate report months once and allow partial payment/reversal", async () => {
  const { db, run, scalar } = await fixture();
  try {
    const [purchase] = await run<{ id: string; revision: number }[]>({
      action: "create",
      entries: [entry("100.00", { account_id: card })],
    });
    const plan = await run<{ id: string; revision: number }>({
      action: "create_installments",
      transaction_id: purchase.id,
      expected_revision: purchase.revision,
      count: 3,
      first_bill_date: "2026-10-31",
      first_due_date: "2026-11-05",
      first_report_month: "2026-11",
      reporting_basis: "billing",
    });
    assert.equal(
      (await scalar(`select balance::text from accounts where id='${card}'`))
        .balance,
      "-100.00",
    );
    await run({
      action: "amend",
      id: purchase.id,
      expected_revision: 1,
      entry: entry("100.00", {
        account_id: card,
        description: "Reviewed purchase",
      }),
    });
    await assert.rejects(
      () =>
        run({
          action: "amend",
          id: purchase.id,
          expected_revision: 2,
          entry: entry("99.00", { account_id: card }),
        }),
      /Linked financial values/,
    );
    const items = (
      await db.query<{ id: string; bill_date: string; amount: string }>(
        "select id,bill_date::text,amount::text from installment_items order by sequence",
      )
    ).rows;
    assert.deepEqual(
      items.map((i) => i.bill_date),
      ["2026-10-31", "2026-11-30", "2026-12-31"],
    );
    assert.deepEqual(
      items.map((i) => i.amount),
      ["33.34", "33.33", "33.33"],
    );
    const rows = (
      await db.query<{ entry: LedgerEntry }>(
        "select entry from finance_report_rows",
      )
    ).rows.map((r) => r.entry);
    assert.equal(monthlyReport(rows, "2026-10").spending, 0);
    assert.equal(monthlyReport(rows, "2026-11").spending, 3334);
    assert.equal(
      rows.reduce((n, t) => n + Number(t.amount), 0),
      100,
    );
    const pay = {
      action: "pay_installment",
      item_id: items[0].id,
      expected_revision: 1,
      account_id: bank,
      amount: "10",
      date: "2026-11-05",
    };
    const key = randomUUID();
    const payment = await run<{ id: string; transaction_id: string }>(pay, key);
    assert.deepEqual(await run(pay, key), payment);
    assert.equal(
      (
        await scalar(
          `select remaining::text from installment_balances where id='${items[0].id}'`,
        )
      ).remaining,
      "23.34",
    );
    await assert.rejects(
      () => run({ ...pay, expected_revision: 2, amount: "24" }),
      /exceeds/,
    );
    await assert.rejects(
      () => run({ ...pay, expected_revision: 2, account_id: foreign }),
      /Invalid account/,
    );
    await assert.rejects(
      () =>
        run({
          action: "reverse",
          id: payment.transaction_id,
          expected_revision: 1,
        }),
      /Linked transaction/,
    );
    await assert.rejects(
      () =>
        run({
          action: "cancel_plan",
          plan_type: "installment",
          id: plan.id,
          expected_revision: 2,
        }),
      /Reverse payments first/,
    );
    await run({
      action: "reverse_settlement",
      settlement_type: "installment_payment",
      id: payment.id,
      expected_revision: 2,
    });
    assert.equal(
      (await scalar(`select balance::text from accounts where id='${card}'`))
        .balance,
      "-100.00",
    );
    await assert.rejects(
      () =>
        run({
          action: "undo",
          id: payment.transaction_id,
          expected_audit_id: "1",
        }),
      /Linked transaction/,
    );
    await run({
      action: "cancel_plan",
      plan_type: "installment",
      id: plan.id,
      expected_revision: 3,
    });
    const restored = (
      await db.query<{ entry: LedgerEntry }>(
        "select entry from finance_report_rows",
      )
    ).rows.map((r) => r.entry);
    assert.equal(monthlyReport(restored, "2026-10").spending, 10000);
  } finally {
    await db.close();
  }
});

test("multiple shared receivables allow partial collections without inflating earned income", async () => {
  const { db, run, scalar } = await fixture();
  try {
    const [purchase] = await run<{ id: string; revision: number }[]>({
      action: "create",
      entries: [
        entry("600", { attribution: "shared", personal_amount: "200" }),
      ],
    });
    const r = await run<{ id: string }>({
      action: "create_receivable",
      transaction_id: purchase.id,
      expected_revision: 1,
      counterparty: "Demo friend",
      amount: "250",
    });
    await run({
      action: "create_receivable",
      transaction_id: purchase.id,
      expected_revision: 1,
      counterparty: "Demo housemate",
      amount: "150",
    });
    await assert.rejects(
      () =>
        run({
          action: "create_receivable",
          transaction_id: purchase.id,
          expected_revision: 1,
          counterparty: "Too much",
          amount: "1",
        }),
      /exceeds/,
    );
    const pay = {
      action: "collect_receivable",
      id: r.id,
      expected_revision: 1,
      account_id: bank,
      amount: "100",
      date: "2026-11-01",
    };
    const key = randomUUID();
    const collection = await run<{ id: string; transaction_id: string }>(
      pay,
      key,
    );
    assert.deepEqual(await run(pay, key), collection);
    assert.equal(
      (
        await scalar(
          `select outstanding::text from receivable_balances where id='${r.id}'`,
        )
      ).outstanding,
      "150.00",
    );
    await assert.rejects(
      () => run({ ...pay, expected_revision: 2, amount: "151" }),
      /exceeds/,
    );
    const rows = (
      await db.query<{ entry: LedgerEntry }>(
        "select entry from finance_report_rows",
      )
    ).rows.map((r) => r.entry);
    const report = monthlyReport(rows, "2026-11");
    assert.equal(report.income, 0);
    assert.equal(report.collected, 10000);
    assert.equal(report.net, 10000);
    await run({
      action: "reverse_settlement",
      settlement_type: "collection",
      id: collection.id,
      expected_revision: 2,
    });
    assert.equal(
      (
        await scalar(
          `select outstanding::text from receivable_balances where id='${r.id}'`,
        )
      ).outstanding,
      "250.00",
    );
    await assert.rejects(
      () => run({ ...pay, expected_revision: 1 }),
      /Receivable changed/,
    );
  } finally {
    await db.close();
  }
});

test("reconciliation audits exact as-of correction, rejects stale revision and blocks unaudited balance writes", async () => {
  const { db, run, scalar } = await fixture();
  try {
    await run({
      action: "create",
      entries: [
        entry("25"),
        entry("50", { date: "2026-11-01", report_month: "2026-11" }),
      ],
    });
    const revision = Number(
      (await scalar(`select revision::text from accounts where id='${bank}'`))
        .revision,
    );
    const op = {
      action: "reconcile_balance",
      id: bank,
      target_type: "account",
      expected_revision: revision,
      observed_balance: "800",
      as_of_date: "2026-10-31",
      reason: "Synthetic closing statement",
    };
    const key = randomUUID();
    const result = await run(op, key);
    assert.deepEqual(await run(op, key), result);
    assert.equal(
      (
        await scalar(
          `select opening_balance::text,balance::text from accounts where id='${bank}'`,
        )
      ).opening_balance,
      "825.00",
    );
    assert.equal(
      (await scalar(`select balance::text from accounts where id='${bank}'`))
        .balance,
      "750.00",
    );
    assert.equal(
      (
        await scalar(
          "select count(*)::text as n from balance_reconciliations where source='reconciliation'",
        )
      ).n,
      "1",
    );
    await assert.rejects(() => run(op), /Balance changed/);
    await assert.rejects(
      () => run({ ...op, id: foreign, expected_revision: 1 }),
      /unavailable/,
    );
    await run({
      ...op,
      id: wallet,
      target_type: "wallet",
      expected_revision: 1,
      observed_balance: "75",
    });
    await db.exec(
      "grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated",
    );
    await assert.rejects(
      () => db.query("update accounts set balance=999 where id=$1", [bank]),
      /audited balance/,
    );
    await assert.rejects(
      () =>
        db.query("update wallets set opening_balance=999 where id=$1", [
          wallet,
        ]),
      /audited balance/,
    );
    await assert.rejects(
      () => db.query("delete from accounts where id=$1", [bank]),
      /cannot be deleted/,
    );
    await assert.rejects(
      () => db.query("delete from wallets where id=$1", [wallet]),
      /cannot be deleted/,
    );
    assert.equal(
      (await db.query("select * from accounts where id=$1", [foreign])).rows
        .length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("select commit_financial_operation_base($1,$2::jsonb)", [
          randomUUID(),
          JSON.stringify({ action: "create", entries: [entry()] }),
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into receivables(user_id,transaction_id,counterparty,amount) values($1,$2,$3,10)",
          [owner, randomUUID(), "Direct write"],
        ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
