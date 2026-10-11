import test from "node:test";
import assert from "node:assert/strict";
import { loadYearReport, isReportYear } from "../lib/finance/year-report";
import { spendingInsights } from "../lib/finance/spending-insights";
import { demoEntries } from "../lib/finance/demo";
import { monthlyReport } from "../lib/finance/core";
import { monthHref, yearHref, isLocalMonthlyNavigation } from "../lib/finance/monthly-navigation";

test("year totals equal all twelve reports and monthly bars use report-month assignment", () => {
  const rows = Array.from({ length: 12 }, (_, i) => demoEntries(`2026-${String(i + 1).padStart(2, "0")}`)).flat();
  rows.push({ ...rows[1], id: "assigned", date: "2025-12-30", report_month: "2026-03", amount: "0.01" });
  const annual = spendingInsights(rows, "2026", "2026-10-11");
  assert.equal(annual.days.length, 12);
  assert.equal(annual.elapsed, 10);
  let income = 0, spending = 0;
  for (let i = 1; i <= 12; i++) {
    const report = monthlyReport(rows, `2026-${String(i).padStart(2, "0")}`);
    income += report.income; spending += report.spending;
    assert.equal(annual.days[i - 1].amount, report.spending);
    assert.equal(annual.days[i - 1].income, report.income);
  }
  assert.equal(annual.income, income);
  assert.equal(annual.total, spending);
  assert.equal(annual.days[10].actual, null);
  assert.equal(annual.categories.reduce((sum, row) => sum + row.amount, 0), spending);
  assert.equal(spendingInsights(rows, "2025", "2026-10-11").total, 0);
  assert.equal(spendingInsights(rows, "2026", "2025-10-11").elapsed, 0);
});

test("year loading fetches only necessary pages and rejects incomplete totals", async () => {
  const row = demoEntries("2026-01")[0];
  const offsets: number[] = [];
  const rows = await loadYearReport(async offset => {
    offsets.push(offset);
    return { rows: Array(offset === 0 ? 1000 : 2).fill(row), count: offset === 0 ? 1002 : null, error: false };
  });
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(rows.length, 1002);
  assert.deepEqual(await loadYearReport(async () => ({ rows: [], count: 0, error: false })), []);
  for (const result of [{ rows: [], count: null, error: true }, { rows: [], count: 12001, error: false }, { rows: [], count: 10, error: false }]) {
    await assert.rejects(loadYearReport(async () => result));
  }
  await assert.rejects(loadYearReport(async offset => ({ rows: offset ? [] : Array(1000).fill(row), count: 1001, error: false })));
});

test("year selection changes data scope, and month selection removes the yearly scope", () => {
  assert.equal(yearHref('/dashboard', '2026'), '/dashboard?view=overview&year=2026');
  assert.equal(monthHref('/dashboard', 'view=overview&year=2026&period=1', '2026-03'), '/dashboard?month=2026-03&view=overview');
  assert.equal(isLocalMonthlyNavigation(new URL('https://example.com/dashboard?year=2026'), new URL('https://example.com/dashboard?year=2025')), false);
  for (const year of ['1899', '2101', '26', '2026-10', '2026.1']) { assert.equal(isReportYear(year), false); assert.throws(() => yearHref('/dashboard', year)); }
});
