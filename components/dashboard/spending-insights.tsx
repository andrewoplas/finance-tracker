"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { spendingInsights } from "@/lib/finance/spending-insights";
import type { LedgerEntry } from "@/lib/finance/core";

const MonthlyComparisonChart = dynamic(() => import("./monthly-comparison-chart"), {
  loading: () => <p className="insight-help">Loading comparison…</p>,
});
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export function SpendingInsights({ entries, month, today, budget, categories, planHref }: {
  entries: LedgerEntry[]; month: string; today: string; budget: number;
  categories: { id: string; name: string }[]; planHref: string;
}) {
  const [showCategories, setShowCategories] = useState(false);
  const [showPurchases, setShowPurchases] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [filter, setFilter] = useState<{ kind: "category"; id: string | null } | { kind: "day"; date: string } | null>(null);
  const insights = useMemo(() => spendingInsights(entries, month, today), [entries, month, today]);
  const names = new Map(categories.map(category => [category.id, category.name]));
  const categoryName = (id: string | null) => names.get(id ?? "") ?? "Uncategorized";
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const remaining = budget - insights.total;
  const throughLabel = insights.elapsed ? `${monthLabel} ${insights.elapsed}` : "month start";
  const purchases = insights.purchases.filter(purchase => !filter || (filter.kind === "category" ? purchase.entry.category_id === filter.id : purchase.date === filter.date));
  const purchaseTitle = !filter ? "Biggest expenses" : filter.kind === "category" ? `${categoryName(filter.id)} expenses` : `Expenses on ${dateLabel(filter.date)}`;
  const elapsedDays = insights.days.slice(0, insights.elapsed);
  const largestDay = Math.max(...elapsedDays.map(day => day.amount), 1);
  function chooseFilter(next: typeof filter) {
    setFilter(next);
    setShowPurchases(false);
  }

  return <section className="surface spending-hero insights-panel" aria-label="Income and spending insights">
    <h2 className="insight-overview-title">Your month at a glance</h2>
    <p className="insight-help">All amounts assigned to this report month</p>
    <div className="insight-totals">
      <div><h3>Income</h3><strong className="insight-income">{money(insights.income)}</strong><small>Earned income</small></div>
      <div><h3>Spending</h3><strong className="insight-expense">{money(insights.total)}</strong><small>Transfers excluded</small></div>
      <div><h3>Income − spending</h3><strong className={insights.incomeMinusSpending < 0 ? "insight-expense" : "insight-income"}>{money(insights.incomeMinusSpending)}</strong><small>Not your account balance</small></div>
    </div>
    <p className="insight-takeaway">{insights.income > 0 ? `Spending is ${Math.round(insights.total / insights.income * 100)}% of recorded income.` : insights.total > 0 ? "You have recorded expenses, but no income for this month yet." : "Add income and expenses to see your month take shape."}</p>

    <div className="insight-main-view">
      <section className="insight-categories insight-categories-spending" aria-label="Spending categories">
        <div className="section-heading"><h3>Where your money went</h3></div>
        <p className="insight-help">Choose a category to see its expenses.</p>
        {!insights.categories.length ? <p className="empty-copy">No expenses recorded for this month.</p> : <>
          <ul className="insight-category-list">
            {(showCategories ? insights.categories : insights.categories.slice(0, 5)).map(category => <li key={category.id ?? "uncategorized"}>
              <button type="button" className="insight-category-button" aria-pressed={filter?.kind === "category" && filter.id === category.id} aria-controls="overview-purchases" onClick={() => chooseFilter(filter?.kind === "category" && filter.id === category.id ? null : { kind: "category", id: category.id })}>
                <span className="insight-category-label"><span>{categoryName(category.id)}</span><span><strong>{money(category.amount)}</strong><small>{Math.round(category.amount / insights.total * 100)}%</small></span></span>
                <span className="insight-category-track" aria-hidden="true"><span style={{ width: `${category.amount / insights.total * 100}%` }} /></span>
              </button>
            </li>)}
          </ul>
          {insights.categories.length > 5 && <button type="button" className="text-button" aria-expanded={showCategories} onClick={() => setShowCategories(value => !value)}>{showCategories ? "Show top 5" : `Show all ${insights.categories.length} categories`}</button>}
        </>}
      </section>
      <section className="insight-purchases" id="overview-purchases" aria-label="Expense details">
        <div className="section-heading"><h3>{purchaseTitle}</h3>{filter && <button type="button" className="text-button" onClick={() => chooseFilter(null)}>Clear filter</button>}</div>
        <p className="insight-help" role="status">{purchases.length} {purchases.length === 1 ? "expense" : "expenses"}{filter ? ` · ${money(purchases.reduce((sum, purchase) => sum + purchase.amount, 0))}` : " · Largest amounts first"}</p>
        <ul className="insight-purchase-list">
          {(showPurchases ? purchases : purchases.slice(0, 5)).map(({ entry, amount, date }) => <li key={`${entry.report_kind ?? "transaction"}:${entry.id}`}>
            <div><strong>{entry.description}</strong><small>{categoryName(entry.category_id)} · {dateLabel(date)}{entry.report_kind === "installment" ? " · Installment bill" : ""}{date > today ? " · Future-dated" : ""}{date.slice(0, 7) !== month ? " · Assigned to this month" : ""}</small></div>
            <strong>{money(amount)}</strong>
          </li>)}
        </ul>
        {!purchases.length && <p className="empty-copy">{filter ? "No expenses match this selection." : "Your purchases will appear here as you add expenses."}</p>}
        {purchases.length > 5 && <button type="button" className="text-button" aria-expanded={showPurchases} onClick={() => setShowPurchases(value => !value)}>{showPurchases ? "Show top 5" : `Show all ${purchases.length} expenses`}</button>}
      </section>
    </div>

    <section className="insight-daily" aria-label="Daily expenses">
      <div className="section-heading"><h3>When you spent</h3><span className="insight-help">Through {throughLabel}</span></div>
      <p className="insight-help">Choose a day to see its expenses above. Bar height shows the amount spent that day.</p>
      {insights.elapsed ? <>
        <p className="insight-help">Largest day: {money(Math.max(...elapsedDays.map(day => day.amount)))}</p>
        <div className="insight-day-bars" role="group" aria-label="Choose a spending day">
          {elapsedDays.map(day => {
            const date = `${month}-${String(day.day).padStart(2, "0")}`;
            return <button type="button" key={day.day} title={`${dateLabel(date)}: ${money(day.amount)}`} aria-label={`${dateLabel(date)}: ${money(day.amount)}. Show expenses.`} aria-pressed={filter?.kind === "day" && filter.date === date} aria-controls="overview-purchases" onClick={() => chooseFilter(filter?.kind === "day" && filter.date === date ? null : { kind: "day", date })}>
              <span className="insight-day-column"><span style={{ height: `${day.amount / largestDay * 100}%`, minHeight: day.amount > 0 ? 3 : 0 }} /></span><span>{day.day}</span>
            </button>;
          })}
        </div>
        <p className="insight-help">{monthLabel} · {money(insights.datedToDate)} spent through {throughLabel}</p>
      </> : <p className="empty-copy">Daily spending will appear when this month starts.</p>}
      {(insights.future > 0 || insights.outsideDates > 0) && <p className="chart-caption">The monthly total also includes {insights.future > 0 ? `${money(insights.future)} dated later` : ""}{insights.future > 0 && insights.outsideDates > 0 ? " and " : ""}{insights.outsideDates > 0 ? `${money(insights.outsideDates)} assigned from other months` : ""}. These appear in the expense list, but not the daily bars. Installments use their bill date.</p>}
    </section>

    <details className="insight-income-details"><summary>Income sources · {money(insights.income)}</summary>
      {insights.incomeCategories.length ? <ul className="insight-income-list">{insights.incomeCategories.map(category => <li key={category.id ?? "uncategorized"}><span>{categoryName(category.id)}</span><strong>{money(category.amount)}</strong></li>)}</ul> : <p className="empty-copy">No earned income recorded for this month.</p>}
      <p className="insight-help">Reimbursements collected: {money(insights.collected)}. These are separate from earned income.</p>
    </details>
    <div className="insight-plan"><span>Monthly spending plan</span><strong>{budget ? money(budget) : "Not set"}</strong><span>{budget ? `${money(Math.abs(remaining))} ${remaining < 0 ? "over plan" : "remaining"}` : <Link href={planHref}>Set a spending plan →</Link>}</span></div>
    <div className="insight-comparison">
      <button type="button" className="text-button" aria-expanded={showComparison} aria-controls="overview-cumulative" onClick={() => setShowComparison(value => !value)}>{showComparison ? "Hide cumulative comparison" : "Show cumulative income vs. spending"}</button>
      <div id="overview-cumulative">{showComparison && <MonthlyComparisonChart insights={insights} budget={budget} monthLabel={monthLabel} throughLabel={throughLabel} />}</div>
    </div>
  </section>;
}
