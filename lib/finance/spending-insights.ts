import { minor, type LedgerEntry } from "./core";

// One pass over report rows; keep report-month adjustments out of the daily timeline.
export function spendingInsights(entries: LedgerEntry[], month: string, today: string) {
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const elapsed = month < today.slice(0, 7) ? dayCount : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;
  const amounts = Array<number>(dayCount).fill(0);
  const categories = new Map<string | null, number>();
  let total = 0, outsideDates = 0, future = 0;
  for (const entry of entries) {
    if (entry.report_month !== month || entry.reversed_at || entry.type !== "expense" || entry.report_kind === "collection") continue;
    const amount = minor(entry.amount);
    total += amount;
    categories.set(entry.category_id, (categories.get(entry.category_id) ?? 0) + amount);
    const date = entry.report_kind === "installment" ? entry.bill_date ?? entry.date : entry.date;
    if (date.slice(0, 7) !== month) { outsideDates += amount; continue; }
    const day = Number(date.slice(8, 10));
    amounts[day - 1] += amount;
    if (day > elapsed) future += amount;
  }
  let cumulative = 0;
  const days = amounts.map((amount, index) => {
    cumulative += amount;
    return { day: index + 1, amount, cumulative, actual: index < elapsed ? cumulative : null, daily: index < elapsed ? amount : null };
  });
  return { days, elapsed, dayCount, total, outsideDates, future,
    datedToDate: amounts.slice(0, elapsed).reduce((sum, value) => sum + value, 0),
    categories: [...categories].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount),
  };
}
