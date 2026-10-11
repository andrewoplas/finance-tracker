"use client";

import { Chart as ChartJS, ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, PieController, BarController, LineController, Tooltip, Legend, type ChartOptions } from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

// Register only the chart types used by the overview.
ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, PieController, BarController, LineController, Tooltip, Legend);
export const chartMoney = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value / 100);
const compactMoney = (value: number | string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(Number(value) / 100);
const tick = { color: "#a6adae", font: { size: 11 } };

export function InteractivePie({ labels, amounts, colors, onSelect }: { labels: string[]; amounts: number[]; colors: string[]; onSelect?: (index: number) => void }) {
  return <Pie aria-label="Category amounts; use the category list for details" role="img" data={{ labels, datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: 10 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.label}: ${chartMoney(Number(item.raw))} (${(Number(item.raw) / amounts.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } }, onClick: (_event, elements) => { if (elements[0]) onSelect?.(elements[0].index); } }} />;
}

export function InteractiveBars({ labels, amounts, colors, horizontal = false, onSelect }: { labels: string[]; amounts: number[]; colors: string | string[]; horizontal?: boolean; onSelect?: (index: number) => void }) {
  const options: ChartOptions<"bar"> = {
    responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? "y" : "x",
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => chartMoney(Number(item.raw)) } } },
    scales: {
      x: { grid: { display: horizontal, color: "#354044" }, ticks: horizontal ? { ...tick, callback: compactMoney } : { ...tick, maxRotation: 0, autoSkip: true } , beginAtZero: true },
      y: { grid: { display: !horizontal, color: "#354044" }, ticks: horizontal ? tick : { ...tick, callback: compactMoney }, beginAtZero: true },
    },
    onClick: (_event, elements) => { if (elements[0]) onSelect?.(elements[0].index); },
  };
  return <div className="interactive-bar-chart" style={{ height: horizontal ? 160 : 230 }}><Bar role="img" aria-label={labels.map((label, i) => `${label}: ${chartMoney(amounts[i])}`).join("; ")} data={{ labels, datasets: [{ data: amounts, backgroundColor: colors, borderRadius: 4, maxBarThickness: 36 }] }} options={options} /></div>;
}

export function InteractiveLines({ labels, datasets }: { labels: string[]; datasets: { label: string; data: number[]; borderColor: string; stepped?: boolean; borderDash?: number[] }[] }) {
  return <div className="interactive-line-chart"><Line role="img" aria-label="Cumulative income and expenses; values available in chart data below" data={{ labels, datasets }} options={{ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { color: "#a6adae" } }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${chartMoney(Number(item.raw))}` } } }, scales: { x: { ticks: { ...tick, maxRotation: 0, maxTicksLimit: 6 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...tick, callback: compactMoney }, grid: { color: "#354044" } } } }} /></div>;
}
