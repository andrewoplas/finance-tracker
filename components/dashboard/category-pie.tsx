"use client";

import { useState } from "react";
import { InteractivePie } from "./interactive-charts";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const colors = ["#4da994", "#e6aa50", "#729dd5", "#c77ca5", "#a5ad5c", "#a487d0", "#df8067", "#68acbb"];

export function CategoryPie({ title, total, rows, names, selectedCategory, onSelect }: {
  title: string; total: number; rows: { id: string | null; amount: number }[];
  names: Map<string, string>;
  selectedCategory?: { id: string | null } | null;
  onSelect?: (id: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const slices = rows.map((row, index) => ({ ...row, color: colors[index] ?? `hsl(${(index * 137.508) % 360} 45% 58%)` }));
  return <section className="category-pie-card" aria-label={title}>
    <h3>{title}</h3>
    <div className="category-pie-total">{money(total)}</div>
    {total > 0 ? <div className="category-pie-body">
      <div className="category-pie-visual"><InteractivePie labels={slices.map(slice => names.get(slice.id ?? "") ?? "Uncategorized")} amounts={slices.map(slice => slice.amount)} colors={slices.map(slice => slice.color)} onSelect={onSelect ? index => onSelect(slices[index].id) : undefined} /></div>
      <div className="category-pie-key">
      <ul className="category-pie-legend">
        {(showAll ? slices : slices.slice(0, 5)).map(slice => {
          const content = <><i style={{ background: slice.color }} aria-hidden="true" /><span>{names.get(slice.id ?? "") ?? "Uncategorized"}</span><strong>{money(slice.amount)}</strong><small>{Math.round(slice.amount / total * 100)}%</small></>;
          return <li key={slice.id ?? "uncategorized"}>{onSelect ? <button type="button" aria-pressed={!!selectedCategory && selectedCategory.id === slice.id} aria-controls="overview-purchases" onClick={() => onSelect(slice.id)}>{content}</button> : <div>{content}</div>}</li>;
        })}
      </ul>
      {slices.length > 5 && <button type="button" className="text-button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show top 5" : `Show all ${slices.length} categories`}</button>}
      </div>
    </div> : <div className="category-pie-empty"><div className="category-pie-visual" aria-hidden="true" /><p className="insight-help">No {onSelect ? "expenses" : "income"} recorded for this period.</p></div>}
  </section>;
}
