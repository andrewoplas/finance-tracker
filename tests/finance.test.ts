import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minor,
  decimal,
  dateOnly,
  manilaToday,
  installments,
  monthlyReport,
  entrySchema,
} from "../lib/finance/core";
import { demoEntries } from "../lib/finance/demo";
import { readCSV, stageBudgetFlow, fingerprint } from "../lib/finance/import";

test("exact pesos and centavos never accumulate floating point drift", () => {
  assert.equal(minor("0.10") + minor("0.20"), 30);
  assert.equal(decimal(30), "0.30");
  for (const bad of ["-1", "1.005", "1e3", "NaN", "Infinity", "01.00"])
    assert.throws(() => minor(bad));
});
test("dates validate real calendar days and Philippine midnight", () => {
  assert.equal(dateOnly.safeParse("2026-02-29").success, false);
  assert.equal(dateOnly.safeParse("2024-02-29").success, true);
  assert.equal(manilaToday(new Date("2026-10-05T16:01:00Z")), "2026-10-06");
});
test("installments preserve total and clamp month-end without drifting", () => {
  const rows = installments("100.00", 3, "2026-01-31");
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(
    rows.reduce((n, r) => n + minor(r.amount), 0),
    10000,
  );
});
test("reports exclude transfers, count purchase once and separate personal share", () => {
  const rows = demoEntries("2026-10");
  const report = monthlyReport(rows, "2026-10");
  assert.equal(report.transfers, 800000);
  assert.equal(report.recoverable, 160000);
  assert.equal(report.spending, 2493875);
  assert.equal(report.net, 5500000 - 2493875);
  assert.equal(monthlyReport(rows, "2026-09").spending, 0);
});
test("contracts reject cross-field errors and excessive shares", () => {
  const { id, revision, ...row } = demoEntries("2026-10")[1];
  void id;
  void revision;
  assert.equal(
    entrySchema.safeParse({
      ...row,
      type: "transfer",
      to_account_id: row.account_id,
    }).success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...row, personal_amount: "999999" }).success,
    false,
  );
  assert.equal(entrySchema.safeParse({ ...row, amount: 12 }).success, false);
});
test("CSV handles BOM, CRLF, quoted commas and escaped quotes", () => {
  assert.deepEqual(readCSV('\uFEFFa,b\r\n"one, two","say ""hi"""'), [
    ["a", "b"],
    ["one, two", 'say "hi"'],
  ]);
  assert.throws(() => readCSV('a\n"oops'));
});
test("staging finds duplicates within file and ledger; transfers need mapping", () => {
  const source =
    "date,amount,description,account,type\n2026-10-01,100.00,Lunch,Cash,expense\n2026-10-01,100,Lunch,Cash,expense\n2026-02-30,100,Bad,Cash,expense\n2026-10-01,500,Move,Cash,transfer";
  assert.deepEqual(
    stageBudgetFlow(source).map((r) => r.status),
    ["ready", "duplicate", "exception", "exception"],
  );
  const existing = new Set([
    fingerprint({
      date: "2026-10-01",
      amount: "100",
      description: "Lunch",
      account: "Cash",
      type: "expense",
    }),
  ]);
  assert.equal(stageBudgetFlow(source, existing)[0].status, "duplicate");
});
