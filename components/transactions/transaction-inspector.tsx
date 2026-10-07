"use client";
import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
  onCancel,
  creating = false,
  accounts = [],
  tags = [],
  tagsAvailable = false,
}: {
  tags?: { id: string; name: string }[];
  tagsAvailable?: boolean;
  creating?: boolean;
  accounts?: { id: string; name: string }[];
  entry: LedgerEntry;
  categories: { id: string; name: string; type?: string }[];
  demo: boolean;
  onSaved: (entry: LedgerEntry | null) => void;
  onCancel?: () => void;
}) {
  const formId = useId();
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
    <label className={`workflow-field ${key === "amount" ? creating ? "entry-amount" : "inspector-amount" : ""}`}>
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
  const selectedTags = tags.filter(tag => (draft.tag_ids ?? []).includes(tag.id));
  const reportMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.report_month)
    ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${draft.report_month}-01T00:00:00Z`))
    : "Choose month";
  const tagPicker = tagsAvailable ? <details className="inspector-section tag-editor">
    <summary><span>Tags</span><span className="inspector-summary-value">{selectedTags.length ? selectedTags.slice(0, 2).map(tag => tag.name).join(", ") + (selectedTags.length > 2 ? ` +${selectedTags.length - 2}` : "") : "None"}</span><ChevronDown size={16} /></summary>
    <div className="tag-options" role="group" aria-label="Transaction tags">
      {tags.length ? tags.map(tag => {
        const selected = (draft.tag_ids ?? []).includes(tag.id);
        return <button type="button" key={tag.id} aria-pressed={selected} onClick={() => setDraft(d => ({ ...d, tag_ids: selected ? (d.tag_ids ?? []).filter(id => id !== tag.id) : [...(d.tag_ids ?? []), tag.id] }))}>
          {selected && <Check size={13} aria-hidden="true" />}{tag.name}
        </button>;
      }) : <p className="muted">Add tags in Settings.</p>}
    </div>
  </details> : <p className="muted">Tags unavailable. Existing tags will be preserved.</p>;
  const categoryField = <label className="workflow-field">Category<select value={draft.category_id ?? ""} onChange={event => change("category_id", event.target.value || null)}>
    <option value="">Uncategorized</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
  </select></label>;
  const attributionFields = <>
    <label className="workflow-field">Whose expense?<select value={draft.attribution} onChange={event => change("attribution", event.target.value)}>
      <option value="personal">Personal</option><option value="shared">Shared</option><option value="reimbursable">Reimbursable</option>
    </select></label>
    {draft.attribution !== "personal" && field("personal_amount", "Your personal share (PHP)")}
  </>;
  const saveButton = <button type="submit" form={formId} className="solid-button" disabled={busy}>
    {busy ? "Saving…" : creating ? "Save transaction" : "Save and mark reviewed"}
  </button>;
  return (
    <div className={creating ? undefined : "transaction-editor"}>
      <div className={creating ? undefined : "inspector-scroll"}>
      <form id={formId} className={`workflow-form ${creating ? "amount-first-form" : "inspector-form"}`} onSubmit={save}
        onInvalidCapture={event => { const section = (event.target as HTMLElement).closest("details"); if (section) section.open = true; }}>
        {creating ? <>
          <p className="muted">Manual entry{demo ? " · Changes stay in this demo" : ""}</p>
          <div className="entry-type-switch" aria-label="Transaction type">{(["expense","income"] as const).map(type=><button type="button" key={type} aria-pressed={draft.type===type} onClick={()=>setDraft(d=>({...d,type,category_id:null,attribution:"personal",personal_amount:"0.00"}))}>{type==="expense"?"Expense":"Income"}</button>)}</div>
          {field("amount", "Amount (PHP)")}
          <label className="workflow-field">Account<select value={draft.account_id} onChange={event => change("account_id", event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        </> : <div className="inspector-primary">
          <span className={`inspector-kind ${draft.type}`}>{draft.type === "expense" ? "Expense" : draft.type === "income" ? "Income" : "Transfer"}</span>
          {field("amount", "Amount (PHP)")}
        </div>}
        {field("description", "Description")}
        <div className={creating ? undefined : "inspector-field-row"}>
          {field("date", "Transaction date", "date")}
          {!creating && draft.type === "expense" && categoryField}
        </div>
        {creating && draft.type === "expense" && <details className="category-picker"><summary>Category <b>{categories.find(c=>c.id===draft.category_id)?.name??"Uncategorized"}</b></summary><input aria-label="Search categories" placeholder="Search categories" value={categoryQuery} onChange={event=>setCategoryQuery(event.target.value)}/><div className="category-options" role="group" aria-label="Expense categories">{[{id:"",name:"Uncategorized"},...categories.filter(c=>!c.type||c.type===draft.type)].filter(c=>c.name.toLowerCase().includes(categoryQuery.toLowerCase())).map(c=><button type="button" key={c.id} aria-pressed={(draft.category_id??"")===c.id} onClick={()=>change("category_id",c.id||null)}>{c.name}<span>{(draft.category_id??"")===c.id?"✓":""}</span></button>)}</div></details>}
        {tagPicker}
        <details className="inspector-section">
          <summary><span>Dates & reporting</span><span className="inspector-summary-value">{reportMonth}{draft.bill_date || draft.paid_date ? " · Billing dates set" : ""}</span><ChevronDown size={16} /></summary>
          <div className="inspector-section-content">
            {field("report_month", "Report month", "month")}
            <div className="inspector-field-row">{field("bill_date", "Bill date (optional)", "date")}{field("paid_date", "Paid date (optional)", "date")}</div>
          </div>
        </details>
        {draft.type === "expense" && (creating ? attributionFields : <details className="inspector-section">
          <summary><span>Expense split</span><span className="inspector-summary-value">{draft.attribution === "personal" ? "Personal" : draft.attribution === "shared" ? "Shared" : "Reimbursable"}</span><ChevronDown size={16} /></summary>
          <div className="inspector-section-content">{attributionFields}</div>
        </details>)}
        {demo && !creating && <p className="muted">Changes stay in this demo.</p>}
        {message && <div role="alert" className="notice">{message}</div>}
        {creating && saveButton}
      </form>
      {!demo && !creating && (
        <details className="inspector-section inspector-history">
          <summary><span>History & corrections</span><ChevronDown size={16} /></summary>
          <div className="inspector-section-content">
          <p className="muted">Revision {entry.revision}. Linked installment purchases and settlements are protected; manage their payments in Plans.</p>
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
        </details>
      )}
      </div>
      {!creating && <div className="inspector-footer">
        {onCancel && <button type="button" className="inspector-cancel" disabled={busy} onClick={onCancel}>Cancel</button>}
        {saveButton}
      </div>}
    </div>
  );
}
