import { minor, type LedgerEntry } from "./core";

// One pass over report rows; keep report-month adjustments out of the daily timeline.
export function spendingInsights(entries: LedgerEntry[], month: string, today: string) {
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const elapsed = month < today.slice(0, 7) ? dayCount : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;
  const amounts = Array<number>(dayCount).fill(0);
  const incomeAmounts = Array<number>(dayCount).fill(0);
  const categories = new Map<string | null, number>();
  const incomeCategories = new Map<string | null, number>();
  let total = 0, outsideDates = 0, future = 0;
  let income = 0, incomeOutsideDates = 0, incomeFuture = 0, collected = 0;
  for (const entry of entries) {
    if (entry.report_month !== month || entry.reversed_at) continue;
    // Reimbursement collections are shown separately, never as earned income.
    if (entry.report_kind === "collection") { collected += minor(entry.amount); continue; }
    if (entry.type !== "expense" && entry.type !== "income") continue;
    const amount = minor(entry.amount);
    const isIncome = entry.type === "income";
    const categoryTotals = isIncome ? incomeCategories : categories;
    if (isIncome) income += amount;
    else total += amount;
    categoryTotals.set(entry.category_id, (categoryTotals.get(entry.category_id) ?? 0) + amount);
    const date = entry.report_kind === "installment" ? entry.bill_date ?? entry.date : entry.date;
    if (date.slice(0, 7) !== month) {
      if (isIncome) incomeOutsideDates += amount;
      else outsideDates += amount;
      continue;
    }
    const day = Number(date.slice(8, 10));
    (isIncome ? incomeAmounts : amounts)[day - 1] += amount;
    if (day > elapsed) {
      if (isIncome) incomeFuture += amount;
      else future += amount;
    }
  }
  let cumulative = 0, cumulativeIncome = 0;
  const days = amounts.map((amount, index) => {
    cumulative += amount;
    cumulativeIncome += incomeAmounts[index];
    return {
      day: index + 1, amount, cumulative,
      actual: index < elapsed ? cumulative : null,
      daily: index < elapsed ? amount : null,
      income: incomeAmounts[index], cumulativeIncome,
      actualIncome: index < elapsed ? cumulativeIncome : null,
      dailyIncome: index < elapsed ? incomeAmounts[index] : null,
    };
  });
  const ranked = (totals: Map<string | null, number>) => [...totals]
    .map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
  return {
    days, elapsed, dayCount, total, outsideDates, future,
    income, incomeOutsideDates, incomeFuture, collected, incomeMinusSpending: income - total,
    datedToDate: amounts.slice(0, elapsed).reduce((sum, value) => sum + value, 0),
    incomeToDate: incomeAmounts.slice(0, elapsed).reduce((sum, value) => sum + value, 0),
    categories: ranked(categories), incomeCategories: ranked(incomeCategories),
  };
}
