"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
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
const money = (v: string | number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(v),
  );
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
export function FinancePlans({ demo = false }: { demo?: boolean }) {
  const { data, error, loadedAt, refresh } = useFinanceWorkspace(demo);
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
    <div className="overview workflow-page">
      <header className="overview-header">
        <div>
          <h1>Plans & shared money</h1>
          <p>
            Keep bills, repayments, and balances clear—without counting them
            twice.
          </p>
        </div>
        <Link className="text-button" href={demo ? "/demo" : "/dashboard"}>
          Back to overview
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
          <section className="surface workflow-section">
            <div className="section-heading">
              <h2>Installments</h2>
              <button
                className="solid-button"
                onClick={() => open({ kind: "installments" })}
              >
                Plan a card purchase
              </button>
            </div>
            <p className="muted">
              The purchase records the liability once. Payments move money to
              the card; they are not new expenses.
            </p>
            {!data.installment_plans.length && (
              <p className="empty-copy">
                No installment plans yet. Start from a credit-card expense
                already in your activity.
              </p>
            )}
            {data.installment_plans.map((plan) => {
              const purchase = data.transactions.find(
                (t) => t.id === plan.transaction_id,
              );
              const items = data.installment_balances
                .filter((s) => s.plan_id === plan.id)
                .sort((a, b) => a.sequence - b.sequence);
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
                            <td>
                              {item.bill_date}
                              <br />
                              <small>Due {item.due_date}</small>
                            </td>
                            <td>{item.report_month}</td>
                            <td>{money(item.amount)}</td>
                            <td>{money(item.paid)}</td>
                            <td>{money(item.remaining)}</td>
                            <td>
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
          <section className="surface workflow-section">
            <div className="section-heading">
              <h2>Money coming back</h2>
              <button
                className="solid-button"
                onClick={() => open({ kind: "receivable" })}
              >
                Assign a shared amount
              </button>
            </div>
            <p className="muted">
              Assign the share owed by each person. Only recorded collections
              increase cash; they remain separate from earned income.
            </p>
            {!data.receivable_balances.length && (
              <p className="empty-copy">
                No tracked repayments yet. A shared expense needs a personal
                share before you assign the remainder.
              </p>
            )}
            {data.receivable_balances.map((r) => (
              <article className="workflow-item" key={r.id}>
                <div className="section-heading">
                  <div>
                    <h3>{r.counterparty}</h3>
                    <p className="muted">
                      {
                        data.transactions.find((t) => t.id === r.transaction_id)
                          ?.description
                      }
                    </p>
                  </div>
                  <b>{money(r.outstanding)} outstanding</b>
                </div>
                <p className="muted">
                  Assigned {money(r.amount)} · Collected {money(r.collected)}
                </p>
                <div className="workflow-actions">
                  {Number(r.outstanding) > 0 && (
                    <button
                      className="solid-button"
                      onClick={() => open({ kind: "collect", receivable: r })}
                    >
                      Record collection
                    </button>
                  )}
                  {Number(r.collected) === 0 && (
                    <button
                      className="text-button"
                      onClick={() =>
                        open({
                          kind: "confirm",
                          operation: {
                            action: "cancel_plan",
                            plan_type: "receivable",
                            id: r.id,
                            expected_revision: r.revision,
                          },
                          message:
                            "Remove this uncollected allocation? The original expense and its personal share stay recorded.",
                        })
                      }
                    >
                      Remove allocation
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
          <section className="surface workflow-section" id="reconcile">
            <h2>Match your balances</h2>
            <p className="muted">
              Use a dated statement or counted wallet balance. A correction
              changes the opening baseline and rebuilds the current balance from
              your ledger. It does not create income or spending.
            </p>
            <div className="balance-grid">
              {[
                ...data.accounts.map((a) => ({
                  ...a,
                  targetType: "account" as const,
                })),
                ...data.wallets.map((a) => ({
                  ...a,
                  targetType: "wallet" as const,
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
                      : `Opening baseline ${money(a.opening_balance)}`}{" "}
                    · Revision {a.revision}
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
            <details>
              <summary>Recent balance corrections</summary>
              {data.balance_reconciliations
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
          </section>
          <section className="surface workflow-section">
            <h2>Recorded settlements</h2>
            <p className="muted">
              Correct a mistaken payment or collection here. Reversing restores
              the outstanding amount and reverses its ledger movement together.
            </p>
            {data.receivable_collections.map((c) => {
              const r = data.receivable_balances.find(
                (r) => r.id === c.receivable_id,
              );
              const t = data.transactions.find(
                (t) => t.id === c.transaction_id,
              );
              return r && t ? (
                <div className="settlement-row" key={c.id}>
                  <span>
                    {t.date} · {r.counterparty} · {money(t.amount)}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      open({
                        kind: "confirm",
                        operation: {
                          action: "reverse_settlement",
                          settlement_type: "collection",
                          id: c.id,
                          expected_revision: r.revision,
                        },
                        message:
                          "Reverse this collection and restore the amount owed?",
                      })
                    }
                  >
                    Reverse collection
                  </button>
                </div>
              ) : null;
            })}
            {data.installment_payments.map((p) => {
              const item = data.installment_balances.find(
                (i) => i.id === p.item_id,
              );
              const plan = data.installment_plans.find(
                (l) => l.id === item?.plan_id,
              );
              const t = data.transactions.find(
                (t) => t.id === p.transaction_id,
              );
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
            {!data.receivable_collections.length &&
              !data.installment_payments.length && (
                <p className="empty-copy">No settlements recorded yet.</p>
              )}
          </section>
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
