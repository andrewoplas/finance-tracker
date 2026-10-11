import test from "node:test";
import assert from "node:assert/strict";
import { expenseBreakdown } from "../lib/finance/expense-breakdown";
import { spendingInsights } from "../lib/finance/spending-insights";
import type { LedgerEntry } from "../lib/finance/core";

test("detailed saved tags split broad categories without guessing, overriding specific categories, or double counting", () => {
  const categories = [{ id: "broad", name: "Spending" }, { id: "specific", name: "Pets" }];
  const tags = [{ id: "food", name: "Food" }, { id: "transport", name: "Transportation" }, { id: "trip", name: "Holiday" }];
  const entries = [
    { category_id: "broad", tag_ids: ["food"] },
    { category_id: "broad", tag_ids: ["food", "transport"] },
    { category_id: "specific", tag_ids: ["food"] },
    { category_id: "broad", tag_ids: ["trip"] },
  ].map((row, i) => ({ ...row, id: String(i), type: "expense", amount: "10.00", date: "2026-10-01", report_month: "2026-10" } as LedgerEntry));
  const breakdown = expenseBreakdown(entries, categories, tags);
  assert.deepEqual(entries.map(breakdown.idFor), ["detail:Food & dining", "broad", "specific", "broad"]);
  const report = spendingInsights(entries, "2026", "2026-10-12", breakdown.idFor);
  assert.equal(report.total, 4000);
  assert.equal(report.categories.reduce((sum, row) => sum + row.amount, 0), report.total);
  assert.equal(report.incomeMinusSpending, -4000);
  assert.equal(report.purchases.filter(p => breakdown.idFor(p.entry) === "detail:Food & dining").length, 1);
});
