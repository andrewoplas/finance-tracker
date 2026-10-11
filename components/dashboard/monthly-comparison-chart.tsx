"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { spendingInsights } from "@/lib/finance/spending-insights";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const compactMoney = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(value / 100);

export default function MonthlyComparisonChart({ insights, budget, monthLabel, throughLabel }: {
  insights: ReturnType<typeof spendingInsights>; budget: number; monthLabel: string; throughLabel: string;
}) {
  const points = insights.days.slice(0, insights.elapsed).map(day => ({ ...day, plan: Math.round(budget * day.day / insights.dayCount) }));
  if (!insights.elapsed) return <p className="empty-copy">This month hasn’t started yet.</p>;
  return <>
    <p className="insight-help">Compare how income and spending add up over the month. Dated through {throughLabel}.</p>
    <div className="insight-legend" aria-label="Chart legend">
      <span><i className="insight-income-key" />Income</span>
      <span><i className="insight-expense-key" />Spending</span>
      {budget > 0 && <span><i className="insight-plan-key" />Spending plan · spread evenly</span>}
    </div>
    <div className="insight-chart" role="region" aria-label={`cumulative income and spending in Philippine pesos. Use arrow keys to explore the chart.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={points} margin={{ top: 20, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="day" type="number" domain={[1, Math.max(2, insights.elapsed)]} padding={{ left: 12, right: 12 }} ticks={[...new Set([1, Math.ceil(insights.elapsed / 2), insights.elapsed])]} tickFormatter={day => `${monthLabel} ${day}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tickFormatter={compactMoney} width={65} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }} labelFormatter={day => `${monthLabel} ${day}`} formatter={(value, name) => [money(Number(value)), name]} />
            <Area name="Spending" type="stepAfter" dataKey="actual" stroke="var(--expense)" fill="var(--expense)" fillOpacity={0.08} strokeWidth={2} dot={{ r: 2, fill: "var(--expense)", strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
            <Line name="Income" type="stepAfter" dataKey="actualIncome" stroke="var(--income)" strokeWidth={3} dot={{ r: 2, fill: "var(--income)", strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
          {budget > 0 && <Line name="Even daily spending plan" dataKey="plan" stroke="var(--muted-foreground)" strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {insights.elapsed > 0 && insights.elapsed < insights.dayCount && <ReferenceLine x={insights.elapsed} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />}
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
  </>;
}
