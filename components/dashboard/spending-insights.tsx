"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { spendingInsights } from "@/lib/finance/spending-insights";
import { OverviewCarousel, type OverviewCarouselHandle } from "./overview-carousel";
import { CategoryPie } from "./category-pie";
import type { NetWorth } from "@/lib/finance/net-worth";
import type { LedgerEntry } from "@/lib/finance/core";

const MonthlyComparisonChart = dynamic(() => import("./monthly-comparison-chart"), { loading: () => <p className="insight-help">Loading comparison…</p> });
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const monthShort = (index: number) => new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index - 1, 1)));

function AmountBars({ rows }: { rows: { label: string; amount: number; color: string }[] }) {
  const max = Math.max(...rows.map(row => row.amount), 1);
  return <div className="overview-amount-bars">{rows.map(row => <div key={row.label}>
    <div><span>{row.label}</span><strong>{money(row.amount)}</strong></div>
    <div className="overview-amount-track" aria-hidden="true"><span style={{ width: `${row.amount / max * 100}%`, background: row.color }} /></div>
  </div>)}</div>;
}

export function SpendingInsights({ entries, month, year, today, budget, categories, planHref, netWorth, accountsHref }: {
  netWorth?: NetWorth; accountsHref: string; year?: string;
  entries: LedgerEntry[]; month: string; today: string; budget: number;
  categories: { id: string; name: string }[]; planHref: string;
}) {
  const carousel = useRef<OverviewCarouselHandle>(null);
  const [showPurchases, setShowPurchases] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [filter, setFilter] = useState<{ kind: "category"; id: string | null } | { kind: "day" | "month"; date: string } | null>(null);
  const period = year ?? month;
  const insights = useMemo(() => spendingInsights(entries, period, today), [entries, period, today]);
  const names = new Map(categories.map(category => [category.id, category.name]));
  const categoryName = (id: string | null) => names.get(id ?? "") ?? "Uncategorized";
  const monthLabel = monthShort(Number(month.slice(5)));
  const periodLabel = year ?? `${monthLabel} ${month.slice(0, 4)}`;
  const throughLabel = insights.elapsed ? year ? `${monthShort(insights.elapsed)} ${year}` : `${monthLabel} ${insights.elapsed}` : "period start";
  const purchases = insights.purchases.filter(purchase => !filter || (filter.kind === "category" ? purchase.entry.category_id === filter.id : filter.kind === "month" ? purchase.entry.report_month === filter.date : purchase.date === filter.date));
  const purchaseTitle = !filter ? "Biggest expenses" : filter.kind === "category" ? categoryName(filter.id) : filter.kind === "month" ? `${monthShort(Number(filter.date.slice(5)))} expenses` : `Expenses · ${dateLabel(filter.date)}`;
  const trend = year ? insights.days : insights.days.slice(0, insights.elapsed);
  const largest = Math.max(...trend.map(day => day.amount), 1);
  function chooseFilter(next: typeof filter) {
    setFilter(next); setShowPurchases(false); carousel.current?.goTo(3);
  }

  return <section className="insights-panel overview-card-panel" aria-label="Income and spending insights">
    <OverviewCarousel carouselRef={carousel} cards={[
      { title: "Net worth", content: <section className="net-worth-card" aria-label="Net worth">
        <div className="section-heading"><h2>Net worth</h2><Link href={accountsHref}>Accounts →</Link></div>
        {netWorth?.status === "ready" ? <>
          <div className="net-worth-total">{money(netWorth.total)}</div>
          <AmountBars rows={[{ label: "Assets", amount: netWorth.assets, color: "var(--income)" }, { label: "Debts", amount: netWorth.debts, color: "var(--expense)" }]} />
          <p className="insight-help">Current active accounts · Assets minus debts</p>
        </> : <div className="net-worth-empty"><span aria-hidden="true">—</span><h3>{netWorth?.status === "empty" ? "No accounts yet" : "Balance not available"}</h3><p className="insight-help">{netWorth?.status === "unknown" ? `${netWorth.unknownCount} accounts need verified balances.` : "Add or review your accounts."}<br /><Link href={accountsHref}>Review balances →</Link></p></div>}
      </section> },
      { title: "Income", content: <><CategoryPie title="Total income" total={insights.income} rows={insights.incomeCategories} names={names} /><p className="insight-help compact-chart-note">{periodLabel} · Earned income</p></> },
      { title: "Expenses", content: <><CategoryPie title="Total expenses" total={insights.total} rows={insights.categories} names={names} selectedCategory={filter?.kind === "category" ? filter : null} onSelect={id => chooseFilter({ kind: "category", id })} /><p className="insight-help compact-chart-note">{periodLabel} · Select a category for purchases</p></> },
      { title: "Purchases", content: <section className="insight-purchases" id="overview-purchases" aria-label="Expense details">
        <div className="section-heading"><h3>{purchaseTitle}</h3>{filter && <button type="button" className="text-button" onClick={() => chooseFilter(null)}>Clear</button>}</div>
        <p className="insight-help" role="status">{purchases.length} expenses · {money(purchases.reduce((sum, purchase) => sum + purchase.amount, 0))}</p>
        <ul className="insight-purchase-list purchase-bar-list">{(showPurchases ? purchases : purchases.slice(0, 5)).map(({ entry, amount, date }) => <li key={`${entry.report_kind ?? "transaction"}:${entry.id}`}>
          <div><strong>{entry.description}</strong><small>{dateLabel(date)}{entry.report_kind === "installment" ? " · Bill" : ""}{date > today ? " · Future-dated" : ""}</small></div><strong>{money(amount)}</strong>
          <span className="purchase-amount-bar" aria-hidden="true" style={{ width: `${amount / Math.max(purchases[0]?.amount ?? 0, 1) * 100}%` }} />
        </li>)}</ul>
        {!purchases.length && <p className="empty-copy">No expenses in this selection.</p>}
        {purchases.length > 5 && <button type="button" className="text-button" aria-expanded={showPurchases} onClick={() => setShowPurchases(value => !value)}>{showPurchases ? "Show top 5" : `All ${purchases.length} expenses`}</button>}
      </section> },
      { title: year ? "Monthly spending" : "Daily spending", content: <section className="insight-daily" aria-label="Spending over time">
        <div className="section-heading"><h3>{year ? "Spending by month" : "Spending by day"}</h3><span className="insight-help">{periodLabel}</span></div>
        <div className="trend-scale"><span>{money(largest === 1 ? 0 : largest)}</span><span>₱0</span></div>
        <div className="compact-spending-bars" role="group" aria-label="Select a period to see purchases">{trend.map(day => {
          const date = year ? `${year}-${String(day.day).padStart(2, "0")}` : `${month}-${String(day.day).padStart(2, "0")}`;
          const label = year ? monthShort(day.day) : String(day.day);
          return <button type="button" key={day.day} title={`${label}: ${money(day.amount)}`} aria-label={`${year ? `${label} ${year}` : dateLabel(date)}: ${money(day.amount)}. Show purchases.`} aria-controls="overview-purchases" onClick={() => chooseFilter({ kind: year ? "month" : "day", date })}>
            <span className="compact-spending-column"><span style={{ height: `${day.amount / largest * 100}%`, minHeight: day.amount > 0 ? 2 : 0 }} /></span><span>{year || day.day === 1 || day.day % 5 === 0 || day.day === trend.length ? label : ""}</span>
          </button>;
        })}</div>
        {!trend.length && <p className="empty-copy">This period hasn’t started yet.</p>}
        <p className="insight-help compact-chart-note">{year ? "Monthly report totals · Select a bar for purchases" : `Through ${throughLabel} · Select a bar for purchases`}</p>
        {!year && (insights.future > 0 || insights.outsideDates > 0) && <details className="compact-chart-details"><summary>About these totals</summary><p className="insight-help">Monthly totals also include {money(insights.future)} dated later and {money(insights.outsideDates)} assigned from other months. These are excluded from daily bars.</p></details>}
      </section> },
      { title: year ? "Year summary" : "Monthly summary", content: <>
        <h3>Income vs. expenses</h3><div className="summary-net">{money(insights.incomeMinusSpending)} <small>difference</small></div>
        <AmountBars rows={[{ label: "Income", amount: insights.income, color: "var(--income)" }, { label: "Expenses", amount: insights.total, color: "var(--expense)" }]} />
        <details className="compact-chart-details"><summary>Details{!year ? " & spending plan" : ""}</summary><p className="insight-help">Report-period amounts, not account balances. Transfers excluded. Collected reimbursements: {money(insights.collected)}, separate from income.</p>{!year && <p className="insight-help">Monthly plan: {budget ? money(budget) : "Not set"} · <Link href={planHref}>Manage plan →</Link></p>}</details>
        <div className="insight-comparison"><button type="button" className="text-button" aria-expanded={showComparison} aria-controls="overview-cumulative" onClick={() => setShowComparison(value => !value)}>{showComparison ? "Hide cumulative chart" : "Show cumulative chart"}</button><div id="overview-cumulative">{showComparison && <MonthlyComparisonChart insights={insights} budget={year ? 0 : budget} monthLabel={year ?? monthLabel} throughLabel={throughLabel} annual={!!year} />}</div></div>
      </> },
    ]} />
  </section>;
}
