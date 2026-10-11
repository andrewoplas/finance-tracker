"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { spendingInsights } from "@/lib/finance/spending-insights";
import type { LedgerEntry } from "@/lib/finance/core";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const compactMoney = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(value / 100);

export function SpendingInsights({ entries, month, today, budget, categories, planHref }: {
  entries: LedgerEntry[]; month: string; today: string; budget: number;
  categories: { id: string; name: string }[]; planHref: string;
}) {
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const [showAll, setShowAll] = useState(false);
  const insights = useMemo(() => spendingInsights(entries, month, today), [entries, month, today]);
  const names = new Map(categories.map(category => [category.id, category.name]));
  const points = insights.days.map(day => ({ ...day, plan: Math.round(budget * day.day / insights.dayCount) }));
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const largest = insights.days.slice(0, insights.elapsed).reduce<(typeof insights.days)[number] | undefined>((best, day) => !best || day.amount > best.amount ? day : best, undefined);
  const remaining = budget - insights.total;
  return <section className="surface spending-hero insights-panel" aria-label="Spending insights">
    <div className="summary-heading">
      <div><h2>Spending assigned to this month</h2><div className="hero-amount">{money(insights.total)}</div></div>
      <div className="summary-reference"><span>Monthly plan</span><strong>{budget ? money(budget) : "Not set"}</strong><small>{budget ? `${money(Math.abs(remaining))} ${remaining < 0 ? "over plan" : "remaining"}` : <Link href={planHref}>Set a spending plan →</Link>}</small></div>
    </div>
    <div className="insight-stats">
      <div><span>Dated through {insights.elapsed ? `${monthLabel} ${insights.elapsed}` : "month start"}</span><strong>{money(insights.datedToDate)}</strong></div>
      <div><span>Daily average · elapsed days</span><strong>{insights.elapsed ? money(Math.round(insights.datedToDate / insights.elapsed)) : "—"}</strong></div>
      <div><span>Largest spending day</span><strong>{largest?.amount ? money(largest.amount) : "—"}</strong><small>{largest?.amount ? `${monthLabel} ${largest.day}` : "No dated spending yet"}</small></div>
    </div>
    <div className="insight-chart-heading"><h3>When you spent</h3><div className="chart-switch" role="group" aria-label="Spending chart view">
      <button type="button" aria-pressed={mode === "cumulative"} onClick={() => setMode("cumulative")}>Cumulative</button>
      <button type="button" aria-pressed={mode === "daily"} onClick={() => setMode("daily")}>Daily</button>
    </div></div>
    <p className="insight-help">{mode === "cumulative" ? "How spending adds up throughout the month." : "Spot the days that drive your spending."}{budget > 0 && mode === "cumulative" ? " Dashed line: your plan spread evenly across the month." : ""}</p>
    <div className="insight-chart" role="region" aria-label={`${mode} spending in Philippine pesos. Use arrow keys to explore the chart.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 20, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="day" type="number" domain={[1, insights.dayCount]} ticks={[1, 8, 15, 22, insights.dayCount]} tickFormatter={day => `${monthLabel} ${day}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tickFormatter={compactMoney} width={65} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }} labelFormatter={day => `${monthLabel} ${day}`} formatter={(value, name) => [money(Number(value)), name]} />
          {mode === "cumulative" ? <Area name="Cumulative spending" type="stepAfter" dataKey="actual" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.12} strokeWidth={3} dot={{ r: 2, fill: "var(--chart-2)", strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} /> : <Bar name="Daily spending" dataKey="daily" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
          {budget > 0 && mode === "cumulative" && <Line name="Even daily plan" dataKey="plan" stroke="var(--muted-foreground)" strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {insights.elapsed > 0 && insights.elapsed < insights.dayCount && <ReferenceLine x={insights.elapsed} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    {!insights.datedToDate && <p className="insight-help">No dated spending recorded through {insights.elapsed ? `${monthLabel} ${insights.elapsed}` : "month start"}.</p>}
    <p className="chart-caption">Transfers excluded · Installments use their bill date.{insights.future > 0 && ` ${money(insights.future)} dated later in the month is included in the total, but not the chart yet.`}{insights.outsideDates > 0 && ` ${money(insights.outsideDates)} assigned from other months is included in the total and categories, but not this daily chart.`}</p>
    <div className="insight-categories">
      <div className="section-heading"><h3>Where it went</h3><span className="insight-help">Share of this month’s total</span></div>
      {!insights.categories.length ? <p className="empty-copy">Your spending categories will appear as you add expenses.</p> : <>
        <p className="insight-help">{names.get(insights.categories[0].id ?? "") ?? "Uncategorized"} accounts for {Math.round(insights.categories[0].amount / insights.total * 100)}% of spending.</p>
        <ul className="insight-category-list">{(showAll ? insights.categories : insights.categories.slice(0, 5)).map(category => <li key={category.id ?? "uncategorized"}>
          <div><span>{names.get(category.id ?? "") ?? "Uncategorized"}</span><span><strong>{money(category.amount)}</strong><small>{Math.round(category.amount / insights.total * 100)}%</small></span></div>
          <div className="insight-category-track" aria-hidden="true"><span style={{ width: `${category.amount / insights.total * 100}%` }} /></div>
        </li>)}</ul>
        {insights.categories.length > 5 && <button type="button" className="text-button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show top 5" : `Show all ${insights.categories.length} categories`}</button>}
      </>}
    </div>
    <details className="insight-table"><summary>View daily amounts</summary><div className="report-table-wrap"><table className="report-table"><caption className="sr-only">Daily spending, including future dated entries</caption><thead><tr><th scope="col">Date</th><th scope="col">Spending</th><th scope="col">Cumulative</th></tr></thead><tbody>{insights.days.map(day => <tr key={day.day}><th scope="row">{monthLabel} {day.day}{day.day > insights.elapsed ? " · Future" : ""}</th><td>{money(day.amount)}</td><td>{money(day.cumulative)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
