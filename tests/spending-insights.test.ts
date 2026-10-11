import test from "node:test";
import assert from "node:assert/strict";
import { spendingInsights } from "../lib/finance/spending-insights";
import { monthlyReport, type LedgerEntry } from "../lib/finance/core";
import { demoEntries } from "../lib/finance/demo";

const expense = demoEntries("2026-10").find(entry => entry.type === "expense")!;
const row = (overrides: Partial<LedgerEntry>): LedgerEntry => ({ ...expense, amount: "100", ...overrides });
test("chart and categories reconcile with the report while separating future and off-month dates", () => {
  const entries = [row({}), row({ date: "2026-10-20", amount: "250" }), row({ date: "2026-09-30", amount: "50" }),
    row({ report_kind: "installment", date: "2026-08-02", bill_date: "2026-10-05", amount: "75" }),
    row({ reversed_at: "2026-10-03" }), row({ type: "transfer" }), row({ type: "income" }),
    row({ report_kind: "collection" }), row({ report_month: "2026-09" })];
  const result = spendingInsights(entries, "2026-10", "2026-10-11");
  assert.equal(result.total, monthlyReport(entries, "2026-10").spending);
  assert.equal(result.total, 47500);
  assert.equal(result.datedToDate, 17500);
  assert.equal(result.future, 25000);
  assert.equal(result.outsideDates, 5000);
  assert.equal(result.days[4].daily, 7500);
  assert.equal(result.days[10].actual, 17500);
  assert.equal(result.days[11].actual, null);
  assert.equal(result.categories.reduce((sum, category) => sum + category.amount, 0), result.total);
  assert.equal(result.datedToDate + result.future + result.outsideDates, result.total);
});
test("past, future, empty and leap-year months have correct date boundaries", () => {
  assert.equal(spendingInsights([], "2024-02", "2026-10-11").days.length, 29);
  const past = spendingInsights([row({})], "2026-10", "2026-11-01");
  assert.equal(past.elapsed, 31);
  assert.equal(past.days[30].actual, 10000);
  const future = spendingInsights([row({})], "2026-10", "2026-09-30");
  assert.equal(future.elapsed, 0);
  assert.equal(future.datedToDate, 0);
  assert.ok(future.days.every(day => day.actual === null));
  assert.equal(spendingInsights([], "2026-10", "2026-10-11").total, 0);
});
test("uncategorized expenses are included and category ranking uses amounts", () => {
  const result = spendingInsights([row({ amount: "0.01" }), row({ category_id: null, amount: "200" })], "2026-10", "2026-10-11");
  assert.deepEqual(result.categories[0], { id: null, amount: 20000 });
  assert.equal(result.total, 20001);
});
