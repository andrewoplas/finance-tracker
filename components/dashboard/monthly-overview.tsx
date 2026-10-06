"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TransactionInspector } from "@/components/transactions/transaction-inspector";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  X,
} from "lucide-react";
import { monthlyReport, minor, type LedgerEntry } from "@/lib/finance/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type OverviewData = {
  entries: LedgerEntry[];
  reportEntries?: LedgerEntry[];
  categories: { id: string; name: string; amount: string }[];
  commitments: {
    id: string;
    description: string;
    amount: string;
    next_date: string;
  }[];
  accounts: { id: string; name: string }[];
  error?: string;
  partial?: string;
  loadedAt: string;
  retro?: string;
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(cents / 100);
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
function shiftMonth(month: string, shift: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + shift);
  return d.toISOString().slice(0, 7);
}

export function MonthlyOverview({
  month,
  data,
  demo = false,
  view = "overview",
  initialFilter = "all",
}: {
  month: string;
  data: OverviewData;
  demo?: boolean;
  view?: string;
  initialFilter?: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(data.entries);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(data.retro ?? "");
  const [filter, setFilter] = useState(initialFilter);
  const reportEntries = data.reportEntries ?? entries;
  const report = useMemo(
    () => monthlyReport(reportEntries, month),
    [reportEntries, month],
  );
  const budget = data.categories.reduce((n, c) => n + minor(c.amount), 0);
  const pending = entries.filter((t) => t.review_status === "pending");
  const spendingCategories = data.categories.map((c) => ({
    ...c,
    spent: reportEntries
      .filter((t) => t.type === "expense" && t.category_id === c.id)
      .reduce((n, t) => n + minor(t.amount), 0),
  }));
  const base = demo ? "/demo" : "/dashboard";
  async function savePlan() {
    if (demo) {
      setNotice("Reflection saved for this demo view only.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/finance/retro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, notes }),
      });
      setNotice(
        response.ok
          ? "Monthly reflection saved."
          : "Could not save. Your draft is still here.",
      );
    } catch {
      setNotice("Connection failed. Your draft is still here.");
    } finally {
      setBusy(false);
    }
  }
  const dayCount = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const daily = Array.from({ length: dayCount }, (_, i) =>
    reportEntries
      .filter((t) => {
        const date =
          t.report_kind === "installment" ? (t.bill_date ?? t.date) : t.date;
        const day = date.slice(0, 7) === month ? Number(date.slice(-2)) : 1;
        return t.type === "expense" && day <= i + 1;
      })
      .reduce((n, t) => n + minor(t.amount), 0),
  );
  const max = Math.max(budget, report.spending, 1);
  const visible = entries.filter(t => filter === "all" || (filter === "pending" ? t.review_status === "pending" : t.category_id === filter)).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const shown = view === "overview" ? visible.slice(0, 5) : visible;
  const days = [...new Set(shown.map(t => t.date))];
  const route = (nextView: string, nextFilter = "all") => `${base}?month=${month}&view=${nextView}&filter=${nextFilter}`;
  return (
    <div className="overview">
      {demo && (
        <div className="demo-banner">
          <span>
            <b>Demo workspace</b> · Synthetic data. Changes reset when you leave this view.
          </span>
          <Link href="/login">
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <header className="overview-header">
        <h1>{view === "transactions" ? "Transactions" : view === "analysis" ? "Spending plan" : view === "reflection" ? "Monthly reflection" : "Overview"}</h1>
        <div className="month-switch">
          <Link
            aria-label="Previous month"
            href={`${base}?month=${shiftMonth(month, -1)}&view=${view}`}
          >
            <ChevronLeft size={18} />
          </Link>
          <span>{monthName(month)}</span>
          <Link
            aria-label="Next month"
            href={`${base}?month=${shiftMonth(month, 1)}&view=${view}`}
          >
            <ChevronRight size={18} />
          </Link>
        </div>
      </header>
      <nav className="workspace-tabs" aria-label="Monthly views">
        <Link aria-current={view === "overview" ? "page" : undefined} href={route("overview")}>Overview</Link>
        <Link aria-current={view === "transactions" ? "page" : undefined} href={route("transactions")}>Transactions</Link>
        <Link aria-current={view === "analysis" ? "page" : undefined} href={route("analysis")}>Spending plan</Link>
        <details><summary>More</summary><div className="more-menu"><Link href={`${base}/plans`}>Plans & shared money</Link><Link href={`${base}/import`}>Import CSV</Link><Link href={route("reflection")}>Monthly reflection</Link></div></details>
      </nav>
      {notice && (
        <div role="status" className="notice">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {data.error ? (
        <section className="surface unavailable" role="alert">
          <CircleHelp />
          <h2>Your overview couldn’t load</h2>
          <p>{data.error}</p>
          <p>We haven’t replaced your ledger with zero balances.</p>
          <a className="solid-button" href={`${base}?month=${month}`}>
            Try again
          </a>
        </section>
      ) : (
        <>
          {data.partial && (
            <div role="alert" className="notice">
              {data.partial}
            </div>
          )}
          {view === "overview" && <>
            <section className="surface spending-hero">
              <div className="summary-heading"><div><h2>Spending this month</h2><div className="hero-amount">{money(report.spending)}</div></div><div className="summary-reference"><span>Monthly plan</span><strong>{budget ? money(budget) : "Not set"}</strong><small>{budget ? `${money(Math.abs(budget-report.spending))} ${report.spending > budget ? "over plan" : "remaining"}` : "Set a plan in Spending plan"}</small></div></div>
              <div className="spending-chart">
                <div className="chart-legend">
                  <span>
                    <i /> Cumulative report spending
                  </span>
                  {budget > 0 && (
                    <span>
                      <i className="plan-dot" /> Monthly plan
                    </span>
                  )}
                </div>
                <svg
                  viewBox="0 0 600 110"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Cumulative report spending through the selected month"
                >
                  <path
                    d="M0 95 H600 M0 50 H600"
                    stroke="#e9e9e9"
                    fill="none"
                  />
                  {budget > 0 && (
                    <path
                      d={`M0 ${100 - (budget / max) * 85} H600`}
                      stroke="#b8b8b8"
                      strokeDasharray="5 5"
                      fill="none"
                    />
                  )}
                  <path
                    d={`M0 100 ${daily.map((n, i) => `L${(i * 600) / (dayCount - 1)} ${100 - (n / max) * 85}`).join(" ")} L600 100 Z`}
                    fill="#f3f3f3"
                  />
                  <polyline
                    points={daily
                      .map(
                        (n, i) =>
                          `${(i * 600) / (dayCount - 1)},${100 - (n / max) * 85}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#131313"
                    strokeWidth="2.5"
                  />
                </svg>
                <div className="chart-axis">
                  <span>1 {monthName(month).split(" ")[0]}</span>
                  <span>15</span>
                  <span>Month end</span>
                </div>
              </div>
              <p className="chart-caption">Report spending · Transfers excluded</p>
            </section>
            <Link className="review-link" href={route("transactions", "pending")}><span>Needs review</span><span><b className="review-count">{pending.length}</b><ChevronRight size={16}/></span></Link>
          </>}
          {view === "analysis" && <div className="analysis-view">
            <section className="surface categories-panel">
              <div className="section-heading">
                <h2>Where it went</h2>
                {!demo && (
                  <Link href="/dashboard/budgets">
                    Manage plan <ArrowRight size={14} />
                  </Link>
                )}
              </div>
              <div className="category-head">
                <span>CATEGORY</span>
                <span>SPENT / PLAN</span>
              </div>
              {spendingCategories.length ? (
                spendingCategories.map((c, i) => (
                  <button
                    className="category-row"
                    key={c.id}
                    onClick={() => {
                      router.push(route("transactions", c.id));
                    }}
                  >
                    <div>
                      <span>
                        <i
                          style={{
                            background: [
                              "#39755c",
                              "#a1b8a5",
                              "#cda777",
                              "#829ba3",
                              "#aea0b7",
                            ][i % 5],
                          }}
                        />
                        {c.name}
                      </span>
                      <span>
                        <b>{money(c.spent)}</b>{" "}
                        <small>
                          /{" "}
                          {minor(c.amount) ? money(minor(c.amount)) : "No plan"}
                        </small>
                      </span>
                    </div>
                    <div className="category-track">
                      <span
                        style={{
                          width: `${minor(c.amount) ? Math.min(100, (c.spent / minor(c.amount)) * 100) : 0}%`,
                          background:
                            c.spent > minor(c.amount) && minor(c.amount) > 0
                              ? "#b57555"
                              : undefined,
                        }}
                      />
                    </div>
                  </button>
                ))
              ) : (
                <p className="empty-copy">
                  No categories yet. Your actual spending will appear here once
                  transactions are categorized.
                </p>
              )}
            </section>
            <section className="surface commitments-panel">
              <div className="section-heading">
                <h2>Coming up</h2>
                <span className="soft-badge">Commitments</span>
              </div>
              <p className="muted">
                Scheduled amounts, not additional spending.
              </p>
              {data.commitments.length ? (
                data.commitments.slice(0, 4).map((c) => (
                  <div className="commitment" key={c.id}>
                    <div className="date-tile">
                      <small>
                        {monthName(c.next_date.slice(0, 7)).slice(0, 3)}
                      </small>
                      <b>{c.next_date.slice(-2)}</b>
                    </div>
                    <span>
                      <b>{c.description}</b>
                      <small>Scheduled · not yet posted</small>
                    </span>
                    <strong>{money(minor(c.amount))}</strong>
                  </div>
                ))
              ) : (
                <p className="empty-copy">No upcoming commitments recorded.</p>
              )}
              {!demo && (
                <Link className="text-button" href="/dashboard/plans">
                  Manage installments & repayments <ArrowRight size={14} />
                </Link>
              )}
              <div className="receivable">
                <span>
                  Shared & reimbursable share <CircleHelp size={14} />
                </span>
                <b>{money(report.recoverable)}</b>
                <small>
                  Allocated to others. Collection is tracked in Plans and is not
                  available cash.
                </small>
              </div>
            </section>
          </div>}
          {(view === "overview" || view === "transactions") && <section className="surface activity-panel" id="activity">
            <div className="section-heading">
              <div>
                <h2>{view === "overview" ? "Recent transactions" : filter === "pending" ? "Needs review" : "Transactions"}</h2>
              </div>
              {view === "overview" ? <Link href={route("transactions")}>See all <ChevronRight size={14}/></Link> : <select
                aria-label="Filter activity"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All activity</option>
                <option value="pending">Needs review</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>}
            </div>
            {days.map(date => <div className="transaction-day" key={date}><h3>{new Intl.DateTimeFormat("en", {weekday:"short", month:"short", day:"numeric",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`))}</h3><div className="transaction-group">{shown.filter(t => t.date === date).map(t => (
                <button
                  className="activity-row"
                  key={t.id}
                  onClick={() => setSelected(t)}
                >
                  <span className={`activity-icon ${t.type}`}>
                    {t.type === "income" ? (
                      <ArrowDownLeft size={17} />
                    ) : t.type === "transfer" ? (
                      <ArrowRight size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <span className="activity-title">
                    <b>{t.description}</b>
                    <small>
                      {data.accounts.find((a) => a.id === t.account_id)?.name ??
                        "Account"}
                    </small>
                  </span>
                  <span className="activity-category">
                    {t.type === "transfer"
                      ? "Transfer · excluded from spending"
                      : (data.categories.find((c) => c.id === t.category_id)
                          ?.name ?? "Uncategorized")}
                  </span>
                  {t.review_status === "pending" && (
                    <span className="pending-dot" aria-label="Needs review" />
                  )}
                  <strong className={`value-${t.type}`}>
                    {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                    {money(minor(t.amount))}
                  </strong>
                  <ChevronRight size={15} />
                </button>
              ))}</div></div>)}
            {!entries.some(
              (t) =>
                filter === "all" ||
                (filter === "pending"
                  ? t.review_status === "pending"
                  : t.category_id === filter),
            ) && <p className="empty-copy">No transactions in this view.</p>}
          </section>}
          {view === "reflection" && <section className="surface reflection">
            <div>
              <div className="eyebrow">MONTHLY REFLECTION</div>
              <h2>What will you carry into next month?</h2>
              <p className="muted">
                Keep a small, practical plan alongside your actual spending.
              </p>
            </div>
            <label className="sr-only" htmlFor="reflection">
              Monthly reflection
            </label>
            <textarea
              id="reflection"
              value={notes}
              maxLength={5000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="One thing that worked. One thing to adjust."
            />
            <button className="solid-button" disabled={busy} onClick={savePlan}>
              Save reflection
            </button>
          </section>}
          <footer className="overview-footer">
            <span>PHP · Asia/Manila · Report month basis</span>
            <span>
              {demo ? "Illustrative data" : `Loaded ${data.loadedAt}`} ·
              Transfers excluded from spending
            </span>
          </footer>
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="inspection workflow-dialog">
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>Review the amount, dates, category, and personal share.</DialogDescription>
          </DialogHeader>
          {selected && (
            <TransactionInspector
              key={selected.id}
              entry={selected}
              categories={data.categories}
              demo={demo}
              onSaved={(updated) => {
                setEntries((items) =>
                  updated
                    ? items.map((t) => (t.id === updated.id ? updated : t))
                    : items.filter((t) => t.id !== selected.id),
                );
                setSelected(null);
                setNotice(
                  demo
                    ? "Updated in this demo view only."
                    : "Correction saved with an audit record.",
                );
                if (!demo) router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
