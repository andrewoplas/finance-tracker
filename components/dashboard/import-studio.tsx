"use client";
import { useState } from "react";
import Link from "next/link";
import { stageBudgetFlow, type ImportRow } from "@/lib/finance/import";
import { useFinanceWorkspace, type ImportBatch } from "@/lib/finance/workspace";
import { commitOperation } from "@/lib/finance/client";
import { entrySchema, manilaToday } from "@/lib/finance/core";
const example =
  "date,amount,description,account,type\n2026-10-03,2340.50,Weekend groceries,Everyday account,expense\n2026-10-03,2340.50,Weekend groceries,Everyday account,expense\n2026-10-05,1250,Lunch with friends,Everyday account,expense\n2026-10-06,5000,Move to savings,Everyday account,transfer";
type Decision = "include" | "skip" | "include_duplicate";
export function ImportStudio({ demo = false }: { demo?: boolean }) {
  const { data, error, loadedAt, refresh } = useFinanceWorkspace(demo);
  const [source, setSource] = useState(demo ? example : ""),
    [name, setName] = useState("BudgetFlow import"),
    [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [destinations, setDestinations] = useState<Record<number, string>>({}),
    [selected, setSelected] = useState<ImportBatch | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({}),
    [closings, setClosings] = useState<Record<string, string>>({}),
    [asOf, setAsOf] = useState(manilaToday());
  const [historyOnly, setHistoryOnly] = useState(false);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function parse() {
    try {
      const parsed = stageBudgetFlow(source);
      if (parsed.length > 100)
        throw new Error("Split the CSV into batches of at most 100 rows.");
      setRows(parsed);
      setSelected(null);
      setNotice("");
      setConfirmed(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not read CSV");
    }
  }
  function selectBatch(batch: ImportBatch) {
    setSelected(batch);
    setDecisions({});
    setClosings({});
    setConfirmed(false);
    setNotice("");
  }
  async function saveBatch() {
    if (!data) return;
    setBusy(true);
    setNotice("");
    try {
      const mapped = rows.map((r) => {
        const parsed = entrySchema.safeParse({
          account_id: mapping[r.account],
          to_account_id:
            r.type === "transfer" ? (destinations[r.row] ?? null) : null,
          type: r.type,
          amount: r.amount,
          description: r.description,
          date: r.date,
          report_month: r.date.slice(0, 7),
        });
        return {
          source_row: r.row,
          source:
            `${r.date} | ${r.account} | ${r.description} | ${r.amount} | ${r.type}`.slice(
              0,
              1000,
            ),
          entry: parsed.success ? parsed.data : null,
        };
      });
      const result = await commitOperation({
        action: "stage_import",
        name,
        rows: mapped,
      });
      if (result.error) throw result.error;
      selectBatch(result.result as ImportBatch);
      setNotice("Review batch saved. No ledger entries have been imported.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save batch");
    } finally {
      setBusy(false);
    }
  }
  const included =
    selected?.rows.filter(
      (r) =>
        decisions[r.source_row] === "include" ||
        decisions[r.source_row] === "include_duplicate",
    ) ?? [];
  const affected = [
    ...new Set(
      included.flatMap((r) =>
        r.entry
          ? [
              r.entry.account_id,
              ...(r.entry.to_account_id ? [r.entry.to_account_id] : []),
            ]
          : [],
      ),
    ),
  ];
  async function commit() {
    if (!selected || !confirmed) return;
    setBusy(true);
    setNotice("");
    try {
      if (selected.rows.some((r) => !decisions[r.source_row]))
        throw new Error("Choose a decision for every row.");
      const result = await commitOperation({
        action: "commit_import",
        mode: historyOnly ? "history_only" : "reconciled",
        id: selected.id,
        expected_revision: selected.revision,
        decisions: selected.rows.map((r) => ({
          source_row: r.source_row,
          decision: decisions[r.source_row],
        })),
        closing_balances: historyOnly ? [] : affected.map((id) => ({
          account_id: id,
          as_of_date: asOf,
          balance: closings[id] ?? "",
        })),
      });
      if (result.error) throw result.error;
      setSelected(result.result as ImportBatch);
      setNotice(
        "Import committed atomically. The batch and its decisions are saved.",
      );
      setConfirmed(false);
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Import rejected. Nothing from this batch was committed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const accounts = data?.accounts.filter((a) => !a.is_archived) ?? [];
  const mappingSelect = (
    value: string,
    onChange: (id: string) => void,
    label: string,
  ) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Unmapped · exception</option>
      {accounts.map((a) => (
        <option value={a.id} key={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="overview workflow-page">
      <Link className="text-button" href={demo ? "/demo" : "/dashboard"}>
        ← Back to overview
      </Link>
      <header className="overview-header">
        <div>
          <h1>Import CSV</h1>
          <p>
            Map your export, review each row, and match the closing statement.
          </p>
        </div>
      </header>
      {demo && (
        <div className="demo-banner">
          Synthetic preview · Parsing works locally. Sign in to save and commit
          a review batch.
        </div>
      )}
      {error && (
        <div role="alert" className="notice">
          {error} {data && `Last loaded ${loadedAt}.`}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      <section className="surface workflow-section">
        <h2>1. Map your CSV</h2>
        <p className="muted">
          Use headers date, amount, description, account, type. Dates:
          YYYY-MM-DD; amounts: positive decimals. Transfer destinations are
          mapped below. Up to 100 rows per review batch.
        </p>
        <label className="workflow-field">
          Batch name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="text-button">
          Choose CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2000000) {
                setNotice("Choose a CSV smaller than 2 MB");
                return;
              }
              setSource(await file.text());
              setName(file.name);
              setRows([]);
              setSelected(null);
            }}
          />
        </label>
        <textarea
          className="csv-source"
          aria-label="CSV source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setRows([]);
          }}
          placeholder={example}
        />
        <button className="solid-button" onClick={parse}>
          Preview and map rows
        </button>
        {rows.length > 0 && (
          <>
            <div className="balance-grid">
              {[...new Set(rows.map((r) => r.account))].map((account) => (
                <label key={account} className="workflow-field">
                  {account || "Missing source account"} →
                  {mappingSelect(
                    mapping[account] ?? "",
                    (id) => setMapping((m) => ({ ...m, [account]: id })),
                    `Map ${account}`,
                  )}
                </label>
              ))}
            </div>
            <div className="workflow-table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Row",
                      "Source",
                      "Amount",
                      "Type / destination",
                      "Source review",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>
                        {r.date}
                        <br />
                        {r.description}
                        <br />
                        <small>{r.account}</small>
                      </td>
                      <td>{r.amount}</td>
                      <td>
                        {r.type}
                        {r.type === "transfer" &&
                          mappingSelect(
                            destinations[r.row] ?? "",
                            (id) =>
                              setDestinations((d) => ({ ...d, [r.row]: id })),
                            `Destination row ${r.row}`,
                          )}
                      </td>
                      <td>
                        {r.status}
                        <br />
                        <small>{r.reason}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Unmapped or invalid rows are saved as exceptions and can only be
              skipped. Correct the CSV and save a new batch to include them.
              Category starts uncategorized for later review.
            </p>
            <button
              className="solid-button"
              disabled={busy || demo || !data}
              onClick={saveBatch}
            >
              {busy ? "Saving…" : "Save review batch · no ledger writes"}
            </button>
          </>
        )}
      </section>
      {data && data.import_batches.length > 0 && (
        <section className="surface workflow-section">
          <h2>Saved batches</h2>
          {data.import_batches.map((b) => (
            <button
              key={b.id}
              className="batch-choice"
              onClick={() => selectBatch(b)}
            >
              <span>{b.name}</span>
              <small>
                {b.state} · {b.rows.length} rows
              </small>
            </button>
          ))}
        </section>
      )}
      {selected && (
        <section className="surface workflow-section">
          <h2>2. Review {selected.name}</h2>
          <p className="muted">
            {selected.state === "committed"
              ? `${selected.result?.transactions.length ?? 0} imported`
              : "0 imported"}{" "}
            · {selected.rows.filter((r) => r.status === "ready").length} valid
            candidates ·{" "}
            {selected.rows.filter((r) => r.status === "duplicate").length}{" "}
            duplicate candidates ·{" "}
            {selected.rows.filter((r) => r.status === "exception").length}{" "}
            exceptions
          </p>
          <div className="workflow-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row / source</th>
                  <th>Saved result</th>
                  <th>Your decision</th>
                </tr>
              </thead>
              <tbody>
                {selected.rows.map((r) => (
                  <tr key={r.source_row}>
                    <td style={{ whiteSpace: "normal", maxWidth: 300 }}>
                      {r.source_row} · {r.source}
                    </td>
                    <td>
                      {r.status}
                      {r.matches && r.matches.length > 0 && (
                        <details>
                          <summary>Compare matches</summary>
                          {r.matches.map((m, i) => (
                            <p key={i}>
                              {m.source ??
                                `${m.date} · ${m.description} · ${m.amount} · ledger ${m.id}`}
                            </p>
                          ))}
                        </details>
                      )}
                      {r.reason && (
                        <p style={{ whiteSpace: "normal", maxWidth: 220 }}>
                          {r.reason}
                        </p>
                      )}
                    </td>
                    <td>
                      {selected.state === "committed" ? (
                        selected.result?.decisions.find(
                          (d) => d.source_row === r.source_row,
                        )?.decision
                      ) : (
                        <select
                          aria-label={`Decision row ${r.source_row}`}
                          value={decisions[r.source_row] ?? ""}
                          onChange={(e) => {
                            setDecisions((d) => ({
                              ...d,
                              [r.source_row]: e.target.value as Decision,
                            }));
                            setConfirmed(false);
                          }}
                        >
                          <option value="">Choose a decision</option>
                          <option value="skip">Skip this row</option>
                          {r.status !== "exception" && (
                            <>
                              <option value="include">
                                Include if not duplicate
                              </option>
                              <option value="include_duplicate">
                                Include as a separate purchase
                              </option>
                            </>
                          )}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected.state === "staged" && (
            <>
              <h2 style={{ marginTop: 25 }}>3. Import mode</h2>
              <label className="review-confirm"><input type="checkbox" checked={historyOnly} onChange={e => { setHistoryOnly(e.target.checked); setConfirmed(false); }} />Import history only · balances remain Unknown</label>
              {historyOnly ? <p className="notice">Use accounts with unknown opening balances. Income and expense history remains available; attribution needs review. No closing balance or net worth is asserted.</p> : <>
              <h3>Match your closing balances</h3>
              <p className="muted">
                Every affected account must have an opening baseline. Use{" "}
                <Link className="text-button" href="/dashboard/plans#reconcile">
                  balance reconciliation
                </Link>{" "}
                with a statement before the import begins if needed. A mismatch
                rejects the whole batch.
              </p>
              <label className="workflow-field">
                Closing statement date
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => {
                    setAsOf(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <div className="balance-grid">
                {affected.map((id) => (
                  <label className="workflow-field" key={id}>
                    {accounts.find((a) => a.id === id)?.name ?? id} · expected
                    closing balance (PHP)
                    <input
                      inputMode="decimal"
                      placeholder="Statement balance"
                      value={closings[id] ?? ""}
                      onChange={(e) => {
                        setClosings((c) => ({ ...c, [id]: e.target.value }));
                        setConfirmed(false);
                      }}
                    />
                  </label>
                ))}
              </div>
              </>}
              <label className="review-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {historyOnly ? "I reviewed every include/skip decision. Balances and attribution remain unverified." : "I reviewed every include/skip decision and compared closing balances with my statements."}
              </label>
              <button
                className="solid-button"
                disabled={busy || !confirmed}
                onClick={commit}
              >
                {busy
                  ? "Checking and saving…"
                  : `Commit ${included.length} reviewed rows`}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
