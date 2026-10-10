"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, CreditCard, History, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useFinanceWorkspace,
  type InstallmentItem,
  type InstallmentPlan,
  type Receivable,
  type WorkspaceAccount,
} from "@/lib/finance/workspace";
import { commitOperation } from "@/lib/finance/client";
import { installments, manilaToday, minor } from "@/lib/finance/core";
import type { Operation } from "@/lib/finance/contracts";
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const money = (v: string | number) => currency.format(Number(v));
type Mode =
  | { kind: "installments" }
  | { kind: "receivable" }
  | { kind: "pay"; item: InstallmentItem; plan: InstallmentPlan }
  | { kind: "collect"; receivable: Receivable }
  | {
      kind: "reconcile";
      target: WorkspaceAccount;
      targetType: "account" | "wallet";
    }
  | { kind: "confirm"; operation: Operation; message: string };
export function FinancePlans({ demo = false, children }: { demo?: boolean; children?: ReactNode }) {
  const { data, error, loadedAt, refresh } = useFinanceWorkspace(demo);
  const reconciliation = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const revealBalanceCheck = () => {
      if (window.location.hash === "#reconcile" && reconciliation.current) {
        reconciliation.current.open = true;
      }
    };
    revealBalanceCheck();
    window.addEventListener("hashchange", revealBalanceCheck);
    return () => window.removeEventListener("hashchange", revealBalanceCheck);
  }, [data]);
  const overview = useMemo(() => {
    const transactions = new Map(data?.transactions.map((t) => [t.id, t]));
    const schedules = new Map<string, InstallmentItem[]>();
    let remaining = 0;
    for (const item of data?.installment_balances ?? []) {
      remaining += minor(String(item.remaining));
      const items = schedules.get(item.plan_id) ?? [];
      items.push(item);
      schedules.set(item.plan_id, items);
    }
    for (const items of schedules.values()) items.sort((a, b) => a.sequence - b.sequence);
    return {
      transactions,
      schedules,
      remaining: remaining / 100,
      active: data?.installment_plans.filter((p) => schedules.get(p.id)?.some((i) => Number(i.remaining) > 0)).length ?? 0,
      unknown: (data?.accounts ?? []).filter((a) => a.opening_balance === null).length,
    };
  }, [data]);
  const [mode, setMode] = useState<Mode | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  function open(next: Mode) {
    setMode(next);
    setNotice("");
    setForm({
      date: manilaToday(),
      first_bill_date: manilaToday(),
      first_due_date: manilaToday(),
      first_report_month: manilaToday().slice(0, 7),
      count: "3",
      reporting_basis: "billing",
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !mode) return;
    if (demo) {
      setNotice(
        "This demo has no connected ledger. Sign in to use saved workflows.",
      );
      return;
    }
    setBusy(true);
    try {
      let operation: Operation;
      const transaction = data.transactions.find(
        (t) => t.id === form.transaction_id,
      );
      if (mode.kind === "installments") {
        if (!transaction) throw new Error("Choose a recorded card purchase");
        operation = {
          action: "create_installments",
          transaction_id: transaction.id,
          expected_revision: transaction.revision,
          count: Number(form.count),
          first_bill_date: form.first_bill_date,
          first_due_date: form.first_due_date,
          first_report_month: form.first_report_month,
          reporting_basis: form.reporting_basis as "purchase" | "billing",
        };
      } else if (mode.kind === "receivable") {
        if (!transaction)
          throw new Error("Choose a shared or reimbursable expense");
        operation = {
          action: "create_receivable",
          transaction_id: transaction.id,
          expected_revision: transaction.revision,
          counterparty: form.counterparty,
          amount: form.amount,
        };
      } else if (mode.kind === "pay")
        operation = {
          action: "pay_installment",
          item_id: mode.item.id,
          expected_revision: mode.plan.revision,
          account_id: form.account_id,
          amount: form.amount,
          date: form.date,
        };
      else if (mode.kind === "collect")
        operation = {
          action: "collect_receivable",
          id: mode.receivable.id,
          expected_revision: mode.receivable.revision,
          account_id: form.account_id,
          amount: form.amount,
          date: form.date,
        };
      else if (mode.kind === "reconcile")
        operation = {
          action: "reconcile_balance",
          id: mode.target.id,
          target_type: mode.targetType,
          expected_revision: mode.target.revision,
          as_of_date: form.date,
          observed_balance: form.amount,
          reason: form.reason,
        };
      else operation = mode.operation;
      const result = await commitOperation(operation);
      if (result.error) throw result.error;
      setMode(null);
      setForm({});
      setNotice(
        "Saved. The operation and its result are recorded in your audit history.",
      );
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: string,
    label: string,
    type = "text",
    extra: Record<string, string | number> = {},
  ) => (
    <label className="workflow-field">
      {label}
      <input
        required
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        {...extra}
      />
    </label>
  );
  const accountField = () => (
    <label className="workflow-field">
      Account
      <select
        required
        value={form.account_id ?? ""}
        onChange={(e) => set("account_id", e.target.value)}
      >
        <option value="">Choose an account</option>
        {data?.accounts
          .filter((a) => !a.is_archived)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    </label>
  );
  const chosen = data?.transactions.find((t) => t.id === form.transaction_id);
  let preview: ReturnType<typeof installments> = [];
  if (chosen && mode?.kind === "installments") {
    try {
      preview = installments(
        String(chosen.amount),
        Number(form.count),
        form.first_bill_date,
      );
    } catch {}
  }
  return (
    <div className="overview workflow-page plans-page">
      <header className="overview-header">
        <div>
          <span className="eyebrow plans-eyebrow">YOUR MONEY, LOOKING AHEAD</span>
          <h1>Installments</h1>
          <p>
            Track card purchases, payment schedules, and balances.
          </p>
        </div>
        <Link className="text-button" href={demo ? "/demo" : "/dashboard"}>
          <ArrowLeft size={15} aria-hidden="true" /> Overview
        </Link>
      </header>
      {demo && (
        <div className="demo-banner">
          Demo · No connected ledger or saved financial operations.
        </div>
      )}
      {error && (
        <div role="alert" className="notice">
          {error} {data && `Showing last loaded data from ${loadedAt}.`}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {!data && !error && (
        <div className="surface" role="status">
          Loading your plans…
        </div>
      )}
      {data && (
        <>
          <div className="plans-summary" aria-label="Plans at a glance">
            <a href="#installments" className="plans-stat">
              <span><CreditCard size={18} aria-hidden="true" /> Left to pay</span>
              <strong>{money(overview.remaining)}</strong>
              <small>{overview.active} active installment {overview.active === 1 ? "plan" : "plans"}</small>
            </a>
            <a href="#reconcile" className="plans-stat" onClick={() => {
              if (reconciliation.current) reconciliation.current.open = true;
            }}>
              <span><Wallet size={18} aria-hidden="true" /> Balance check</span>
              <strong>{overview.unknown ? `${overview.unknown} to check` : `${data.accounts.length} balances`}</strong>
              <small>{overview.unknown ? "Opening balances need confirmation" : data.accounts.length ? "Opening balances are recorded" : "Add an account to get started"}</small>
            </a>
          </div>
          <div className={`plans-primary${data.installment_plans.length ? " has-items" : ""}`}>
          <section className="surface workflow-section" id="installments" aria-labelledby="installments-heading">
            <div className="section-heading plans-section-heading">
              <div className="plans-section-title"><CreditCard size={20} aria-hidden="true" /><h2 id="installments-heading">Installments</h2></div>
              <button
                className="solid-button"
                onClick={() => open({ kind: "installments" })}
              >
                <Plus size={16} aria-hidden="true" /> New plan
              </button>
            </div>
            <p className="muted">
              Split a recorded card purchase into a payment schedule.
            </p>
            {!data.installment_plans.length && (
              <div className="plans-empty">
                <span className="plans-empty-icon"><CalendarDays size={24} aria-hidden="true" /></span>
                <h3>Make room for bigger purchases</h3>
                <p>Choose a card expense from your activity to track each installment and its due date.</p>
                <button className="text-button" onClick={() => open({ kind: "installments" })}>Plan your first purchase →</button>
              </div>
            )}
            {data.installment_plans.map((plan) => {
              const purchase = overview.transactions.get(plan.transaction_id);
              const items = overview.schedules.get(plan.id) ?? [];
              return (
                <article key={plan.id} className="workflow-item">
                  <div className="section-heading">
                    <h3>{purchase?.description ?? "Card purchase"}</h3>
                    <b>
                      {money(
                        items.reduce(
                          (n, s) => n + minor(String(s.remaining)),
                          0,
                        ) / 100,
                      )}{" "}
                      left to pay
                    </b>
                  </div>
                  <p className="muted">
                    Purchase {purchase?.date} · {items.length} installments ·
                    Report on{" "}
                    {plan.reporting_basis === "billing"
                      ? "allocated billing months"
                      : "purchase month"}
                  </p>
                  <div className="workflow-table-wrap">
                    <table>
                      <caption className="sr-only">Payment schedule for {purchase?.description ?? "card purchase"}</caption>
                      <thead>
                        <tr>
                          {[
                            "Bill / due date",
                            "Report month",
                            "Amount",
                            "Paid",
                            "Remaining",
                            "",
                          ].map((h, i) => (
                            <th key={i}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Bill / due date">
                              {item.bill_date}
                              <br />
                              <small>Due {item.due_date}</small>
                            </td>
                            <td data-label="Report month">{item.report_month}</td>
                            <td data-label="Amount">{money(item.amount)}</td>
                            <td data-label="Paid">{money(item.paid)}</td>
                            <td data-label="Remaining">{money(item.remaining)}</td>
                            <td className="plans-payment-action">
                              {Number(item.remaining) > 0 && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({ kind: "pay", item, plan })
                                  }
                                >
                                  Record payment
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {items.every((i) => Number(i.paid) === 0) && (
                    <button
                      className="text-button"
                      onClick={() =>
                        open({
                          kind: "confirm",
                          operation: {
                            action: "cancel_plan",
                            plan_type: "installment",
                            id: plan.id,
                            expected_revision: plan.revision,
                          },
                          message:
                            "Cancel this unpaid schedule? The purchase remains. Billing-month allocations will return to the original purchase report month.",
                        })
                      }
                    >
                      Cancel unpaid plan
                    </button>
                  )}
                </article>
              );
            })}
          </section>
          </div>
        </>
      )}
      {children}
      {data && (
        <>
          <details ref={reconciliation} className="surface workflow-section plans-disclosure" id="reconcile">
            <summary><span className="plans-section-title"><Wallet size={20} aria-hidden="true" /><span><h2>Match your balances</h2><small>Check an account against a statement or counted cash.</small></span></span><ChevronDown size={18} aria-hidden="true" /></summary>
            <p className="muted">
              Use a dated statement or counted cash balance. A correction
              changes the opening baseline and rebuilds the current balance from
              your ledger. It does not create income or spending.
            </p>
            <div className="balance-grid">
              {[
                ...data.accounts.map((a) => ({
                  ...a,
                  targetType: "account" as const,
                })),
              ].map((a) => (
                <article className="workflow-item" key={a.id}>
                  <h3>
                    {a.name} <small>· {a.targetType}</small>
                  </h3>
                  <b>{a.opening_balance === null ? 'Unknown' : money(a.balance)}</b>
                  <p className="muted">
                    {a.opening_balance === null
                      ? "Opening balance needs reconciliation"
                      : `Opening baseline ${money(a.opening_balance)}`}
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      open({
                        kind: "reconcile",
                        target: a,
                        targetType: a.targetType,
                      })
                    }
                  >
                    Reconcile balance
                  </button>
                </article>
              ))}
            </div>
            {!data.accounts.length && <p className="empty-copy">Add an account to start checking balances.</p>}
            <details>
              <summary>Recent balance corrections</summary>
              {!data.balance_reconciliations.length && <p className="muted">No balance corrections yet.</p>}
              {[...data.balance_reconciliations]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 10)
                .map((r) => (
                  <p className="muted" key={r.id}>
                    {r.as_of_date} · {r.after_row.name} ·{" "}
                    {r.before_row.opening_balance === null ? 'Unknown' : money(r.before_row.balance)} → {money(r.after_row.balance)}{" "}
                    · {r.reason}
                  </p>
                ))}
            </details>
          </details>
          <details className="surface workflow-section plans-disclosure">
            <summary><span className="plans-section-title"><History size={20} aria-hidden="true" /><span><h2>Settlement history</h2><small>{data.installment_payments.length} recorded payments</small></span></span><ChevronDown size={18} aria-hidden="true" /></summary>
            <p className="muted">
              Correct a mistaken payment here. Reversing restores
              the outstanding amount and reverses its ledger movement together.
            </p>
            {data.installment_payments.map((p) => {
              const item = data.installment_balances.find(
                (i) => i.id === p.item_id,
              );
              const plan = data.installment_plans.find(
                (l) => l.id === item?.plan_id,
              );
              const t = overview.transactions.get(p.transaction_id);
              return plan && t ? (
                <div className="settlement-row" key={p.id}>
                  <span>
                    {t.date} · {t.description} · {money(t.amount)}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      open({
                        kind: "confirm",
                        operation: {
                          action: "reverse_settlement",
                          settlement_type: "installment_payment",
                          id: p.id,
                          expected_revision: plan.revision,
                        },
                        message:
                          "Reverse this payment transfer and restore the installment balance?",
                      })
                    }
                  >
                    Reverse payment
                  </button>
                </div>
              ) : null;
            })}
            {!data.installment_payments.length && (
                <p className="empty-copy">No settlements recorded yet.</p>
              )}
          </details>
          <p className="plans-footnote">Payments move money between balances. They aren’t counted as new spending or income.</p>
        </>
      )}
      <Dialog open={!!mode} onOpenChange={(v) => !v && !busy && setMode(null)}>
        <DialogContent className="workflow-dialog">
          <DialogHeader>
            <DialogTitle>
              {mode?.kind === "installments"
                ? "Plan a card purchase"
                : mode?.kind === "receivable"
                  ? "Assign a shared amount"
                  : mode?.kind === "pay"
                    ? "Record an installment payment"
                    : mode?.kind === "collect"
                      ? "Record a collection"
                      : mode?.kind === "reconcile"
                        ? "Reconcile a balance"
                        : "Review this correction"}
            </DialogTitle>
            <DialogDescription>Review the details before saving changes to your ledger.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="workflow-form">
            {(mode?.kind === "installments" || mode?.kind === "receivable") && (
              <label className="workflow-field">
                Recorded expense
                <select
                  required
                  value={form.transaction_id ?? ""}
                  onChange={(e) => set("transaction_id", e.target.value)}
                >
                  <option value="">Choose a purchase</option>
                  {data?.transactions
                    .filter(
                      (t) =>
                        t.type === "expense" &&
                        (mode.kind === "installments"
                          ? data.accounts.some(
                              (a) =>
                                a.id === t.account_id &&
                                a.type === "credit-card",
                            ) &&
                            !data.installment_plans.some(
                              (p) => p.transaction_id === t.id,
                            )
                          : t.attribution !== "personal"),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.date} · {t.description} · {money(t.amount)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {mode?.kind === "installments" && (
              <>
                {field("count", "Number of installments", "number", {
                  min: 1,
                  max: 120,
                })}
                {field("first_bill_date", "First bill date", "date")}
                {field("first_due_date", "First payment due date", "date")}
                <label className="workflow-field">
                  Spending report basis
                  <select
                    value={form.reporting_basis}
                    onChange={(e) => set("reporting_basis", e.target.value)}
                  >
                    <option value="billing">
                      Allocate spending across billing months
                    </option>
                    <option value="purchase">
                      Report the entire purchase in its original month
                    </option>
                  </select>
                </label>
                {field(
                  "first_report_month",
                  "First allocated report month",
                  "month",
                )}
                <p className="muted">
                  The card liability stays{" "}
                  {chosen ? money(chosen.amount) : "the purchase total"} from
                  the purchase date. No new expense is created when you pay.
                </p>
                {preview.length > 0 && (
                  <details>
                    <summary>
                      Preview {preview.length} exact installments
                    </summary>
                    {preview.map((p) => (
                      <p key={p.date}>
                        {p.date} · {money(p.amount)}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
            {mode?.kind === "receivable" && (
              <>
                {field("counterparty", "Who owes this share?")}
                {field("amount", "Amount assigned (PHP)", "text", {
                  inputMode: "decimal",
                })}
                <p className="muted">
                  Personal share is excluded. Several people can share the
                  remaining amount; total assignments cannot exceed it.
                </p>
              </>
            )}
            {(mode?.kind === "pay" || mode?.kind === "collect") && (
              <>
                {accountField()}
                {field(
                  "amount",
                  "Amount actually paid or received (PHP)",
                  "text",
                  { inputMode: "decimal" },
                )}
                {field("date", "Payment / collection date", "date")}
                <p className="muted">
                  Remaining:{" "}
                  {money(
                    mode.kind === "pay"
                      ? mode.item.remaining
                      : mode.receivable.outstanding,
                  )}
                  . Partial amounts are welcome.
                </p>
              </>
            )}
            {mode?.kind === "reconcile" && (
              <>
                <p>
                  {mode.target.name} · Current balance{" "}
                  {mode.target.opening_balance === null ? 'Unknown' : money(mode.target.balance)}
                </p>
                {field("date", "Statement / counted balance date", "date")}
                {field("amount", "Observed closing balance (PHP)", "text", {
                  inputMode: "decimal",
                })}
                {field("reason", "Why is this correction needed?")}
                <p className="muted">
                  For historical imports, reconcile from a statement before the
                  first imported transaction. Future-dated ledger entries stay
                  separate from the observed closing balance.
                </p>
              </>
            )}
            {mode?.kind === "confirm" && <p>{mode.message}</p>}
            {notice && (
              <p role="alert" className="notice">
                {notice}
              </p>
            )}
            <button className="solid-button" disabled={busy || demo}>
              {busy ? "Saving…" : demo ? "Sign in to save" : "Confirm and save"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
