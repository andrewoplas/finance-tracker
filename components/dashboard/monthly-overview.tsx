"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NetWorth } from "@/lib/finance/net-worth";
import { SpendingInsights } from "./spending-insights";
import { PlanningTabs } from "@/components/layout/planning-tabs";
import { TransactionTools } from "@/components/transactions/transaction-tools";
import { MonthlyLink } from "./monthly-link";
import {PeriodPicker} from "./period-picker";
import {activityDateLabel, activityTimeLabel} from "@/lib/finance/date-label";
import { useRouter, useSearchParams } from "next/navigation";
import { TransactionInspector } from "@/components/transactions/transaction-inspector";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  X,
} from "lucide-react";
import { minor, manilaToday, type LedgerEntry } from "@/lib/finance/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type OverviewData = {
  netWorth?: NetWorth;
  tags?: { id: string; name: string }[];
  tagsAvailable?: boolean;
  entries: LedgerEntry[];
  reportEntries?: LedgerEntry[];
  categories: { id: string; name: string; amount: string }[];
  transactionCategories?: { id: string; name: string; type?: string }[];
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

export function MonthlyOverview({
  month,
  year,
  data,
  demo = false,
  view: initialView = "overview",
  initialFilter = "all",
}: {
  month: string;
  year?: string;
  data: OverviewData;
  demo?: boolean;
  view?: string;
  initialFilter?: string;
}) {
  const inspectorTitle = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const search = useSearchParams();
  const requestedView = search.get("view") ?? initialView;
  const view = ["overview", "transactions", "analysis", "reflection"].includes(requestedView) ? requestedView : "overview";
  const [entries, setEntries] = useState(data.entries);
  const [showRecent, setShowRecent] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(data.retro ?? "");
  const [searchText, setSearchText] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  useEffect(() => { setFilter(search.get("filter") ?? "all"); }, [search]);
  useEffect(() => { setEntries(data.entries); }, [data.entries]);
  useEffect(() => {
    if (!demo) return;
    const added = (event: Event) => {
      const entry = (event as CustomEvent<LedgerEntry>).detail;
      if (entry.report_month === month) setEntries(current => [entry, ...current]);
      setNotice("Saved in this demo view only.");
    };
    window.addEventListener("finance-demo-entry", added);
    return () => window.removeEventListener("finance-demo-entry", added);
  }, [demo, month]);
  const reportEntries = data.reportEntries ?? entries;
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
  const transactionCategories = data.transactionCategories ?? data.categories;
  const accountNames = new Map(data.accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(transactionCategories.map(c => [c.id, c.name]));
  const searchNeedle = searchText.trim().toLowerCase();
  const visible = entries.filter(t =>
    (!searchNeedle || `${t.description} ${t.amount} ${accountNames.get(t.account_id) ?? ""} ${categoryNames.get(t.category_id ?? "") ?? ""}`.toLowerCase().includes(searchNeedle)) &&
    (!accountFilter || t.account_id === accountFilter) && (!typeFilter || t.type === typeFilter) &&
    (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo) &&
    (filter === "all" || (filter === "pending" ? t.review_status === "pending" : filter.startsWith("tag:") ? (t.tag_ids ?? []).includes(filter.slice(4)) : t.category_id === filter))
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "") || a.id.localeCompare(b.id));
  const filteredTotals = visible.reduce((totals, t) => {
    if (t.type === 'income') totals.income += minor(t.amount);
    if (t.type === 'expense') totals.expense += minor(t.amount);
    return totals;
  }, { income: 0, expense: 0 });

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
        <h1>{view === "transactions" ? "Transactions" : view === "analysis" ? "Planning" : view === "reflection" ? "Monthly reflection" : "Overview"}</h1>
        <PeriodPicker month={month} selectedYear={year} allowYear={view === "overview"} />
      </header>
      {view === "analysis" && <PlanningTabs demo={demo} />}
      {view === "transactions" && !demo && <TransactionTools entries={entries} accounts={data.accounts} categories={transactionCategories} />}
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
          <a className="solid-button" href={year ? `${base}?year=${year}` : `${base}?month=${month}`}>
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
            <SpendingInsights year={year} netWorth={data.netWorth} accountsHref={demo ? "/login" : "/dashboard/accounts"} entries={reportEntries} month={month} today={manilaToday()} budget={budget} categories={transactionCategories} planHref={demo ? `/demo?month=${month}&view=analysis` : `/dashboard/budgets?month=${month}`} />
            {!year && <MonthlyLink loadedMonth={month} className="review-link" href={route("transactions", "pending")}><span>Needs review · includes attribution</span><span><b className="review-count">{pending.length}</b><ChevronRight size={16}/></span></MonthlyLink>}
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
                      window.history.pushState(null, "", route("transactions", c.id));
                    }}
                  >
                    <div>
                      <span>
                        <i
                          style={{
                            background: [
                              "var(--chart-2)",
                              "var(--chart-4)",
                              "var(--warning)",
                              "var(--chart-3)",
                              "var(--chart-1)",
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
                    <p className="budget-remaining">{minor(c.amount) ? `${money(Math.abs(minor(c.amount)-c.spent))} ${c.spent>minor(c.amount)?"over plan":"remaining"} of ${money(minor(c.amount))}` : "No budget set"}</p>
                    <div className="category-track" role="progressbar" aria-label={`${c.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={minor(c.amount)?Math.min(100,Math.round(c.spent/minor(c.amount)*100)):0}>
                      <span
                        style={{
                          width: `${minor(c.amount) ? Math.min(100, (c.spent / minor(c.amount)) * 100) : 0}%`,
                          background:
                            c.spent > minor(c.amount) && minor(c.amount) > 0
                              ? "var(--expense)"
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
              {(
                <Link className="text-button" href={`${base}/plans?month=${month}`}>
                  Manage installments <ArrowRight size={14} />
                </Link>
              )}

            </section>
          </div>}
          {view === "overview" && !year && <button type="button" className="text-button overview-recent-toggle" aria-expanded={showRecent} aria-controls="activity" onClick={() => setShowRecent(value => !value)}>{showRecent ? "Hide recent transactions" : "Show recent transactions"}<ChevronDown size={16} aria-hidden="true" /></button>}
          {(view === "transactions" || (view === "overview" && !year && showRecent)) && <section className="surface activity-panel" id="activity">
            <div className="section-heading">
              <div>
                <h2>{view === "overview" ? "Recent transactions" : filter === "pending" ? "Needs review" : "Transactions"}</h2>
              </div>
              {view === "overview" ? <MonthlyLink loadedMonth={month} href={route("transactions")}>See all <ChevronRight size={14}/></MonthlyLink> : null}
            </div>
            {view === "transactions" && <div className={`transaction-filters ${filtersOpen ? "filters-open" : ""}`}>
              <div className="transaction-filter-grid">
                <label className="transaction-filter-search">Search
                  <input type="search" placeholder="Description, amount, account…" value={searchText} onChange={e=>setSearchText(e.target.value)} />
                </label>
                <button type="button" className="transaction-filter-toggle" aria-expanded={filtersOpen} aria-controls="transaction-filter-account transaction-filter-type transaction-filter-activity transaction-filter-dates" onClick={()=>setFiltersOpen(open=>!open)}>{filtersOpen ? "Hide filters" : "Filters"}{[accountFilter,typeFilter,dateFrom,dateTo,filter !== "all" ? filter : ""].filter(Boolean).length > 0 && <span>{[accountFilter,typeFilter,dateFrom,dateTo,filter !== "all" ? filter : ""].filter(Boolean).length} active</span>}<ChevronDown size={16} aria-hidden="true" /></button>
                <label id="transaction-filter-account" className="transaction-filter-secondary">Account<select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}><option value="">All accounts</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label id="transaction-filter-type" className="transaction-filter-secondary">Type<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select></label>
                <label id="transaction-filter-activity" className="transaction-filter-secondary">Activity<select
                aria-label="Filter activity"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All activity</option>
                <option value="pending">Needs review</option>
                {(data.tags ?? []).map(tag => <option key={tag.id} value={`tag:${tag.id}`}>Tag · {tag.name}</option>)}
                {transactionCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select></label>
              </div>
              <div id="transaction-filter-dates" className="transaction-filter-dates">
                <label>From<input type="date" aria-label="From date" max={dateTo || undefined} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></label>
                <label>To<input type="date" aria-label="To date" min={dateFrom || undefined} value={dateTo} onChange={e=>setDateTo(e.target.value)} /></label>
                <button type="button" className="text-button" disabled={!searchText && !accountFilter && !typeFilter && !dateFrom && !dateTo && filter === "all"} onClick={()=>{setSearchText("");setAccountFilter("");setTypeFilter("");setDateFrom("");setDateTo("");setFilter("all");}}>Clear filters</button>
              </div>
              <div className="transaction-filter-summary" aria-live="polite">
                <span>{visible.length} {visible.length === 1 ? "transaction" : "transactions"}</span>
                <dl><div><dt>Income</dt><dd>{money(filteredTotals.income)}</dd></div><div><dt>Expenses</dt><dd>{money(filteredTotals.expense)}</dd></div><div><dt>Net</dt><dd>{money(filteredTotals.income - filteredTotals.expense)}</dd></div></dl>
              </div>
            </div>}
            {days.map(date => <div className="transaction-day" key={date}><h3>{activityDateLabel(date)}</h3><div className="transaction-group">{shown.filter(t => t.date === date).map(t => (
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
                    {!!t.tag_ids?.length && <span className="transaction-tags">{t.tag_ids.map(id => <span key={id}>#{data.tags?.find(tag=>tag.id===id)?.name ?? "Tag"}</span>)}</span>}
                    <small>
                      {transactionCategories.find(c=>c.id===t.category_id)?.name ?? (t.type==="transfer"?"Transfer":"Uncategorized")} · {data.accounts.find((a) => a.id === t.account_id)?.name ??
                        "Account"} · {activityTimeLabel(t.time)}
                    </small>
                  </span>
                  <span className="activity-category">
                    {t.type === "transfer"
                      ? "Transfer · excluded from spending"
                      : (transactionCategories.find((c) => c.id === t.category_id)
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
            {!shown.length && <p className="empty-copy">No transactions in this view.</p>}
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
        <DialogContent className="inspection workflow-dialog transaction-dialog" onOpenAutoFocus={event => { event.preventDefault(); inspectorTitle.current?.focus(); }}>
          <DialogHeader className="transaction-dialog-header">
            <DialogTitle ref={inspectorTitle} tabIndex={-1}>Transaction details</DialogTitle>
            <DialogDescription>Edit details and mark this transaction reviewed.</DialogDescription>
          </DialogHeader>
          {selected && (
            <TransactionInspector
              key={selected.id}
              entry={selected}
              onCancel={() => setSelected(null)}
              categories={transactionCategories}
              tags={data.tags ?? []}
              tagsAvailable={data.tagsAvailable ?? demo}
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
