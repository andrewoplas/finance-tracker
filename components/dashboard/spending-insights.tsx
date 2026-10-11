"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { spendingInsights } from "@/lib/finance/spending-insights";
import type { LedgerEntry } from "@/lib/finance/core";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const compactMoney = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(value / 100);

function CategoryBreakdown({ title, kind, rows, total, names }: {
  title: string; kind: "income" | "spending";
  rows: { id: string | null; amount: number }[]; total: number; names: Map<string, string>;
}) {
  const [showAll, setShowAll] = useState(false);
  return <section className={`insight-categories insight-categories-${kind}`} aria-label={title}>
    <div className="section-heading"><h3>{title}</h3><span className="insight-help">Share of this month’s {kind}</span></div>
    {!rows.length ? <p className="empty-copy">No {kind} recorded for this month.</p> : <>
      <p className="insight-help">{names.get(rows[0].id ?? "") ?? "Uncategorized"} accounts for {Math.round(rows[0].amount / total * 100)}% of {kind}.</p>
      <ul className="insight-category-list">
        {(showAll ? rows : rows.slice(0, 5)).map(category => <li key={category.id ?? "uncategorized"}>
          <div><span>{names.get(category.id ?? "") ?? "Uncategorized"}</span><span><strong>{money(category.amount)}</strong><small>{Math.round(category.amount / total * 100)}%</small></span></div>
          <div className="insight-category-track" aria-hidden="true"><span style={{ width: `${category.amount / total * 100}%` }} /></div>
        </li>)}
      </ul>
      {rows.length > 5 && <button type="button" className="text-button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show top 5" : `Show all ${rows.length} categories`}</button>}
    </>}
  </section>;
}

export function SpendingInsights({ entries, month, today, budget, categories, planHref }: {
  entries: LedgerEntry[]; month: string; today: string; budget: number;
  categories: { id: string; name: string }[]; planHref: string;
}) {
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const insights = useMemo(() => spendingInsights(entries, month, today), [entries, month, today]);
  const names = new Map(categories.map(category => [category.id, category.name]));
  const points = insights.days.map(day => ({ ...day, plan: Math.round(budget * day.day / insights.dayCount) }));
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const remaining = budget - insights.total;
  const throughLabel = insights.elapsed ? `${monthLabel} ${insights.elapsed}` : "month start";

  return <section className="surface spending-hero insights-panel" aria-label="Income and spending insights">
    <h2 className="insight-overview-title">Your month at a glance</h2>
    <p className="insight-help">All amounts assigned to this report month</p>
    <div className="insight-totals">
      <div><h3>Income</h3><strong className="insight-income">{money(insights.income)}</strong><small>Earned income</small></div>
      <div><h3>Spending</h3><strong className="insight-expense">{money(insights.total)}</strong><small>Transfers excluded</small></div>
      <div><h3>Income − spending</h3><strong className={insights.incomeMinusSpending < 0 ? "insight-expense" : "insight-income"}>{money(insights.incomeMinusSpending)}</strong><small>{insights.incomeMinusSpending < 0 ? "Spending exceeds income" : insights.incomeMinusSpending > 0 ? "Income exceeds spending" : "Income and spending are equal"}</small></div>
    </div>
    <p className="insight-help">Income − spending is a report comparison, not your account balance. Reimbursements collected: {money(insights.collected)} (separate from earned income).</p>
    <div className="insight-plan"><span>Monthly spending plan</span><strong>{budget ? money(budget) : "Not set"}</strong><span>{budget ? `${money(Math.abs(remaining))} ${remaining < 0 ? "over plan" : "remaining"}` : <Link href={planHref}>Set a spending plan →</Link>}</span></div>

    <div className="insight-chart-heading"><h3>Income vs. spending</h3><div className="chart-switch" role="group" aria-label="Income and spending chart view">
      <button type="button" aria-pressed={mode === "cumulative"} onClick={() => setMode("cumulative")}>Cumulative</button>
      <button type="button" aria-pressed={mode === "daily"} onClick={() => setMode("daily")}>Daily</button>
    </div></div>
    <p className="insight-help">{mode === "cumulative" ? "Compare how income and spending add up over the month." : "Compare income and spending side by side each day."} Dated through {throughLabel}.</p>
    <div className="insight-legend" aria-label="Chart legend">
      <span><i className="insight-income-key" />Income</span>
      <span><i className="insight-expense-key" />Spending</span>
      {budget > 0 && mode === "cumulative" && <span><i className="insight-plan-key" />Spending plan · spread evenly</span>}
    </div>
    <div className="insight-chart" role="region" aria-label={`${mode} income and spending in Philippine pesos. Use arrow keys to explore the chart.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 20, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="day" type="number" domain={[1, insights.dayCount]} padding={{ left: 12, right: 12 }} ticks={[1, 8, 15, 22, insights.dayCount]} tickFormatter={day => `${monthLabel} ${day}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tickFormatter={compactMoney} width={65} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }} labelFormatter={day => `${monthLabel} ${day}`} formatter={(value, name) => [money(Number(value)), name]} />
          {mode === "cumulative" ? <>
            <Area name="Spending" type="stepAfter" dataKey="actual" stroke="var(--expense)" fill="var(--expense)" fillOpacity={0.08} strokeWidth={2} dot={{ r: 2, fill: "var(--expense)", strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
            <Line name="Income" type="stepAfter" dataKey="actualIncome" stroke="var(--income)" strokeWidth={3} dot={{ r: 2, fill: "var(--income)", strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
          </> : <>
            <Bar name="Income" dataKey="dailyIncome" fill="var(--income)" radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            <Bar name="Spending" dataKey="daily" fill="var(--expense)" radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          </>}
          {budget > 0 && mode === "cumulative" && <Line name="Even daily spending plan" dataKey="plan" stroke="var(--muted-foreground)" strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {insights.elapsed > 0 && insights.elapsed < insights.dayCount && <ReferenceLine x={insights.elapsed} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <div className="insight-stats">
      <div><span>Income through {throughLabel}</span><strong>{money(insights.incomeToDate)}</strong></div>
      <div><span>Spending through {throughLabel}</span><strong>{money(insights.datedToDate)}</strong></div>
      <div><span>Income − spending through {throughLabel}</span><strong>{money(insights.incomeToDate - insights.datedToDate)}</strong></div>
    </div>
    {!insights.datedToDate && !insights.incomeToDate && <p className="insight-help">No dated income or spending recorded through {throughLabel}.</p>}
    <p className="chart-caption">Transfers and reimbursement collections are excluded from the chart. Installments use their bill date.
      {(insights.future > 0 || insights.incomeFuture > 0) && ` Future-dated entries (${money(insights.incomeFuture)} income, ${money(insights.future)} spending) are included in monthly totals, but not the chart yet.`}
      {(insights.outsideDates > 0 || insights.incomeOutsideDates > 0) && ` Entries assigned from other months (${money(insights.incomeOutsideDates)} income, ${money(insights.outsideDates)} spending) are included in totals and categories, but not this daily chart.`}
    </p>
    <div className="insight-breakdowns">
      <CategoryBreakdown title="Where income came from" kind="income" rows={insights.incomeCategories} total={insights.income} names={names} />
      <CategoryBreakdown title="Where spending went" kind="spending" rows={insights.categories} total={insights.total} names={names} />
    </div>
    <details className="insight-table"><summary>View daily amounts</summary><div className="report-table-wrap">
      <table className="report-table">
        <caption className="sr-only">Daily income and spending, including future dated entries. Reimbursement collections excluded.</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Income − spending</th><th scope="col">Cumulative income</th><th scope="col">Cumulative spending</th></tr></thead>
        <tbody>{insights.days.map(day => <tr key={day.day}><th scope="row">{monthLabel} {day.day}{day.day > insights.elapsed ? " · Future" : ""}</th><td>{money(day.income)}</td><td>{money(day.amount)}</td><td>{money(day.income - day.amount)}</td><td>{money(day.cumulativeIncome)}</td><td>{money(day.cumulative)}</td></tr>)}</tbody>
      </table>
    </div></details>
  </section>;
}
