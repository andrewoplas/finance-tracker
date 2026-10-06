"use client";
import { useState } from "react";
import { ZodError } from "zod";
import { entrySchema, type LedgerEntry } from "@/lib/finance/core";
import { commitOperation } from "@/lib/finance/client";
import type { Operation } from "@/lib/finance/contracts";
type Audit = {
  id: string | number;
  before_row: Record<string, unknown> | null;
  after_row: Record<string, unknown> | null;
  created_at: string;
};
export function TransactionInspector({
  entry,
  categories,
  demo,
  onSaved,
  creating = false,
  accounts = [],
}: {
  creating?: boolean;
  accounts?: { id: string; name: string }[];
  entry: LedgerEntry;
  categories: { id: string; name: string; type?: string }[];
  demo: boolean;
  onSaved: (entry: LedgerEntry | null) => void;
}) {
  const [categoryQuery,setCategoryQuery] = useState("");
  const [draft, setDraft] = useState(entry),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [history, setHistory] = useState<Audit[] | null>(null),
    [confirmation, setConfirmation] = useState<"reverse" | "undo" | null>(null);
  const change = (key: string, value: string | null) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const {
        id,
        revision,
        report_kind: reportKind,
        reversed_at: reversed,
        ...values
      } = draft;
      void reportKind;
      void reversed;
      const parsed = entrySchema.parse({
        ...values,
        review_status: "reviewed",
      });
      if (demo) {
        onSaved({ ...parsed, id, revision: revision + 1 });
        return;
      }
      const response = await commitOperation(creating ? { action: "create", entries: [parsed] } : {
        action: "amend",
        id,
        expected_revision: revision,
        entry: parsed,
      });
      if (response.error) throw response.error;
      if (creating) { onSaved(null); return; }
      const result = response.result as { revision: number };
      onSaved({ ...parsed, id, revision: result.revision });
    } catch (e) {
      setMessage(e instanceof ZodError ? e.issues.map(issue => issue.message).join(". ") : e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    setBusy(true);
    try {
      const r = await fetch(`/api/finance/audit?id=${entry.id}`, {
        cache: "no-store",
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setHistory(value.items);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setBusy(false);
    }
  }
  async function correct() {
    if (!confirmation) return;
    setBusy(true);
    setMessage("");
    try {
      const operation: Operation =
        confirmation === "reverse"
          ? {
              action: "reverse",
              id: entry.id,
              expected_revision: entry.revision,
            }
          : {
              action: "undo",
              id: entry.id,
              expected_audit_id: String(history?.[0]?.id),
            };
      const response = await commitOperation(operation);
      if (response.error) throw response.error;
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Correction rejected");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key:
      | "description"
      | "amount"
      | "date"
      | "report_month"
      | "bill_date"
      | "paid_date"
      | "personal_amount",
    label: string,
    type = "text",
  ) => (
    <label className={`workflow-field ${creating && key === "amount" ? "entry-amount" : ""}`}>
      {label}
      <input
        type={type}
        inputMode={key === "amount" || key === "personal_amount" ? "decimal" : undefined}
        value={draft[key] ?? ""}
        onChange={(e) =>
          change(
            key,
            (key === "bill_date" || key === "paid_date") && !e.target.value
              ? null
              : e.target.value,
          )
        }
        required={key !== "bill_date" && key !== "paid_date"}
      />
    </label>
  );
  return (
    <>
      <form className={`workflow-form ${creating ? "amount-first-form" : ""}`} onSubmit={save}>
        <p className="muted">
          {creating ? "Manual entry" : `${entry.type} · Revision ${entry.revision}`}
          {demo ? " · Changes stay in this demo" : ""}
        </p>
        {creating && <><div className="entry-type-switch" aria-label="Transaction type">{(["expense","income"] as const).map(type=><button type="button" key={type} aria-pressed={draft.type===type} onClick={()=>setDraft(d=>({...d,type,category_id:null,attribution:"personal",personal_amount:"0.00"}))}>{type==="expense"?"Expense":"Income"}</button>)}</div>{field("amount", "Amount (PHP)")}<label className="workflow-field">Account<select value={draft.account_id} onChange={e=>change("account_id",e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></>}
        {field("description", "Description")}
        {!creating && field("amount", "Amount (PHP)")}
        {field("date", "Purchase / transaction date", "date")}
        {creating ? <details><summary>Reporting & billing dates</summary><div className="workflow-form mt-3">{field("report_month", "Report month", "month")}{field("bill_date", "Bill date (optional)", "date")}{field("paid_date", "Paid date (optional)", "date")}</div></details> : <>{field("report_month", "Report month", "month")}{field("bill_date", "Bill date (optional)", "date")}{field("paid_date", "Paid date (optional)", "date")}</>}
        {draft.type === "expense" && (
          <>
            {creating ? <details className="category-picker"><summary>Category <b>{categories.find(c=>c.id===draft.category_id)?.name??"Uncategorized"}</b></summary><input aria-label="Search categories" placeholder="Search categories" value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)}/><div className="category-options" role="group" aria-label="Expense categories">{[{id:"",name:"Uncategorized"},...categories.filter(c=>!c.type||c.type===draft.type)].filter(c=>c.name.toLowerCase().includes(categoryQuery.toLowerCase())).map(c=><button type="button" key={c.id} aria-pressed={(draft.category_id??"")===c.id} onClick={()=>change("category_id",c.id||null)}>{c.name}<span>{(draft.category_id??"")===c.id?"✓":""}</span></button>)}</div></details> : <label className="workflow-field">
              Expense category
              <select
                value={draft.category_id ?? ""}
                onChange={(e) => change("category_id", e.target.value || null)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>}
            <label className="workflow-field">
              Whose expense?
              <select
                value={draft.attribution}
                onChange={(e) => change("attribution", e.target.value)}
              >
                <option value="personal">Personal</option>
                <option value="shared">Shared</option>
                <option value="reimbursable">Reimbursable</option>
              </select>
            </label>
            {draft.attribution !== "personal" &&
              field("personal_amount", "Your personal share (PHP)")}
          </>
        )}
        {!creating && <p className="muted">
          Linked installment purchases and settlements are protected. Correct
          those in Plans; cancel unpaid allocations before changing their
          purchase.
        </p>}
        {message && (
          <div role="alert" className="notice">
            {message}
          </div>
        )}
        <button className="solid-button" disabled={busy}>
          {busy ? "Saving…" : creating ? "Save transaction" : "Save and mark reviewed"}
        </button>
      </form>
      {!demo && !creating && (
        <div className="inspector-history">
          <button disabled={busy} className="text-button" onClick={loadHistory}>
            Load audit history
          </button>
          {history && (
            <>
              {history.length === 0 ? (
                <p>No prior changes found.</p>
              ) : (
                <>
                  <p className="muted">
                    Latest change: {history[0].created_at}. Undo checks this
                    exact audit revision before restoring it.
                  </p>
                  <dl>
                    <div>
                      <dt>Before</dt>
                      <dd>
                        {String(
                          history[0].before_row?.description ?? "Not recorded",
                        )}{" "}
                        · {String(history[0].before_row?.amount ?? "—")}
                      </dd>
                    </div>
                    <div>
                      <dt>After</dt>
                      <dd>
                        {String(
                          history[0].after_row?.description ?? "Reversed",
                        )}{" "}
                        · {String(history[0].after_row?.amount ?? "—")}
                      </dd>
                    </div>
                  </dl>
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() => setConfirmation("undo")}
                  >
                    Undo latest change
                  </button>
                </>
              )}
            </>
          )}
          <button
            disabled={busy}
            className="text-button"
            onClick={() => setConfirmation("reverse")}
          >
            Reverse transaction
          </button>
          {confirmation && (
            <div className="notice">
              <div>
                <p>
                  {confirmation === "reverse"
                    ? "Reverse the ledger movement? Its audit snapshot remains available."
                    : "Restore the preceding audited state? A newer change will reject this request."}
                </p>
                <button
                  disabled={busy}
                  className="solid-button"
                  onClick={correct}
                >
                  Confirm {confirmation}
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmation(null)}
                >
                  Keep transaction
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
