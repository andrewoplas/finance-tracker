"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TransactionInspector } from "@/components/transactions/transaction-inspector";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Leaf,
  X,
} from "lucide-react";
import { monthlyReport, minor, type LedgerEntry } from "@/lib/finance/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
}: {
  month: string;
  data: OverviewData;
  demo?: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(data.entries);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(data.retro ?? "");
  const [filter, setFilter] = useState("all");
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
      setNotice("Plan saved for this demo session only.");
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
  return (
    <div className="overview">
      {demo && (
        <div className="demo-banner">
          <span>
            <b>Demo workspace</b> · Synthetic data. Changes stay in this
            session.
          </span>
          <Link href="/login">
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <header className="overview-header">
        <div>
          <div className="eyebrow">YOUR MONTH, AT A GLANCE</div>
          <h1>
            A little clarity.
            <br className="mobile-break" /> A lot more control.
          </h1>
          <p>Review what happened. Make room for what matters.</p>
        </div>
        <div className="month-switch">
          <Link
            aria-label="Previous month"
            href={`${base}?month=${shiftMonth(month, -1)}`}
          >
            <ChevronLeft size={18} />
          </Link>
          <span>{monthName(month)}</span>
          <Link
            aria-label="Next month"
            href={`${base}?month=${shiftMonth(month, 1)}`}
          >
            <ChevronRight size={18} />
          </Link>
        </div>
      </header>
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
          <div className="overview-grid">
            <section className="surface spending-hero">
              <div className="section-heading">
                <h2>Monthly spending</h2>
                <span className="soft-badge">
                  {budget
                    ? report.spending <= budget
                      ? "Within plan"
                      : "Over plan"
                    : "No plan set"}
                </span>
              </div>
              <div className="hero-amount">
                {money(report.spending)}
                <span>spent this month</span>
              </div>
              <div
                className="spending-track"
                role="img"
                aria-label={`${money(report.spending)} spent of ${money(budget)} planned`}
              >
                <span
                  style={{
                    width: `${budget ? Math.min(100, (report.spending / budget) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="plan-summary">
                <div>
                  <span>Monthly plan</span>
                  <strong>{budget ? money(budget) : "Not set"}</strong>
                </div>
                <div>
                  <span>
                    {report.spending > budget && budget
                      ? "Over plan"
                      : "Left in plan"}
                  </span>
                  <strong>
                    {budget ? money(Math.abs(budget - report.spending)) : "—"}
                  </strong>
                </div>
              </div>
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
                  role="img"
                  aria-label="Cumulative report spending through the selected month"
                >
                  <path
                    d="M0 95 H600 M0 50 H600"
                    stroke="#e8ebe7"
                    fill="none"
                  />
                  {budget > 0 && (
                    <path
                      d={`M0 ${100 - (budget / max) * 85} H600`}
                      stroke="#bcc9bf"
                      strokeDasharray="5 5"
                      fill="none"
                    />
                  )}
                  <path
                    d={`M0 100 ${daily.map((n, i) => `L${(i * 600) / (dayCount - 1)} ${100 - (n / max) * 85}`).join(" ")} L600 100 Z`}
                    fill="#eaf2ec"
                  />
                  <polyline
                    points={daily
                      .map(
                        (n, i) =>
                          `${(i * 600) / (dayCount - 1)},${100 - (n / max) * 85}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#24634e"
                    strokeWidth="2.5"
                  />
                </svg>
                <div className="chart-axis">
                  <span>1 {monthName(month).split(" ")[0]}</span>
                  <span>15</span>
                  <span>Month end</span>
                </div>
              </div>
              <div className="hero-foot">
                <Leaf size={17} />
                <span>
                  {budget
                    ? `${money(Math.max(0, budget - report.spending))} of planned spending remains. This is a budget, not an account balance.`
                    : "Set a monthly category plan to give your spending a reference point."}
                </span>
              </div>
            </section>
            <section className="surface review-panel">
              <div className="section-heading">
                <h2>
                  Needs review <span className="count">{pending.length}</span>
                </h2>
                <span className="eyebrow">INBOX</span>
              </div>
              <p className="muted">A quick check keeps your month accurate.</p>
              {pending.length ? (
                <div className="review-rows">
                  {pending.slice(0, 3).map((t) => (
                    <button key={t.id} onClick={() => setSelected(t)}>
                      <div className="review-icon">
                        <CircleHelp size={18} />
                      </div>
                      <span>
                        <b>{t.description}</b>
                        <small>
                          {t.attribution === "reimbursable"
                            ? "Confirm your share"
                            : "Check category & amount"}
                        </small>
                      </span>
                      <strong>{money(minor(t.amount))}</strong>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="caught-up">
                  <Check size={28} />
                  <h3>All caught up</h3>
                  <p>Your transactions are ready for the month’s story.</p>
                </div>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setFilter("pending");
                  document
                    .getElementById("activity")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Review activity <ArrowRight size={15} />
              </button>
              <div className="review-note">
                Log through your assistant. Use this space to check the details.
              </div>
            </section>
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
                      setFilter(c.id);
                      document
                        .getElementById("activity")
                        ?.scrollIntoView({ behavior: "smooth" });
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
          </div>
          <section className="surface activity-panel" id="activity">
            <div className="section-heading">
              <div>
                <h2>Activity</h2>
                <p className="muted">The details behind your month.</p>
              </div>
              <select
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
              </select>
            </div>
            {entries
              .filter(
                (t) =>
                  filter === "all" ||
                  (filter === "pending"
                    ? t.review_status === "pending"
                    : t.category_id === filter),
              )
              .sort(
                (a, b) =>
                  b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
              )
              .map((t) => (
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
                      {t.date} ·{" "}
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
                  <strong>
                    {t.type === "income" ? "+" : ""}
                    {money(minor(t.amount))}
                  </strong>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!entries.some(
              (t) =>
                filter === "all" ||
                (filter === "pending"
                  ? t.review_status === "pending"
                  : t.category_id === filter),
            ) && <p className="empty-copy">No transactions in this view.</p>}
          </section>
          <section className="surface reflection">
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
          </section>
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
                    ? "Updated in this demo session only."
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
