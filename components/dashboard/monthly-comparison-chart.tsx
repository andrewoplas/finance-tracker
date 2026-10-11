"use client";

import { InteractiveLines } from "./interactive-charts";
import type { spendingInsights } from "@/lib/finance/spending-insights";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);


export default function MonthlyComparisonChart({ insights, budget, monthLabel, throughLabel, annual = false }: {
  insights: ReturnType<typeof spendingInsights>; budget: number; monthLabel: string; throughLabel: string; annual?: boolean;
}) {
  const tickLabel = (day: number) => annual ? new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, day - 1, 1))) : `${monthLabel} ${day}`;
  const points = insights.days.slice(0, insights.elapsed).map(day => ({ ...day, plan: Math.round(budget * day.day / insights.dayCount) }));
  if (!insights.elapsed) return <p className="empty-copy">This period hasn’t started yet.</p>;
  return <>
    <p className="insight-help">Cumulative income and spending. Dated through {throughLabel}.</p>
    <InteractiveLines labels={points.map(day => tickLabel(day.day))} datasets={[
      { label: "Income", data: points.map(day => day.cumulativeIncome), borderColor: "#76d4b5", stepped: true },
      { label: "Expenses", data: points.map(day => day.cumulative), borderColor: "#ffa3a7", stepped: true },
      ...(budget > 0 ? [{ label: "Spending plan", data: points.map(day => day.plan), borderColor: "#a6adae", borderDash: [5, 5] }] : []),
    ]} />
    <details className="compact-chart-details"><summary>Chart data</summary><table><thead><tr><th>Period</th><th>Income</th><th>Expenses</th>{budget > 0 && <th>Plan</th>}</tr></thead><tbody>{points.map(day => <tr key={day.day}><th>{tickLabel(day.day)}</th><td>{money(day.cumulativeIncome)}</td><td>{money(day.cumulative)}</td>{budget > 0 && <td>{money(day.plan)}</td>}</tr>)}</tbody></table></details>
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
  </>;
}
