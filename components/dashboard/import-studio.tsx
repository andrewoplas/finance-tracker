"use client";
import { useMemo, useState } from "react";
import { stageBudgetFlow, type ImportRow } from "@/lib/finance/import";
import Link from "next/link";
const example =
  "date,amount,description,account,type\n2026-10-03,2340.50,Weekend groceries,Everyday account,expense\n2026-10-03,2340.50,Weekend groceries,Everyday account,expense\n2026-10-05,1250,Lunch with friends,Everyday account,expense\n2026-10-06,5000,Move to savings,Everyday account,transfer";
export function ImportStudio({ demo = false }: { demo?: boolean }) {
  const [source, setSource] = useState(demo ? example : "");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const counts = useMemo(
    () => ({
      ready: rows.filter((r) => r.status === "ready").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      exception: rows.filter((r) => r.status === "exception").length,
    }),
    [rows],
  );
  const stage = () => {
    try {
      setRows(stageBudgetFlow(source));
      setError("");
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not read CSV");
    }
  };
  return (
    <div className="overview" style={{ maxWidth: 1000, padding: 24 }}>
      <Link href={demo ? "/demo" : "/dashboard"} className="text-button">
        ← Back to overview
      </Link>
      <header className="overview-header">
        <div>
          <div className="eyebrow">IMPORT STUDIO · STAGING ONLY</div>
          <h1>Give your history a clean start.</h1>
          <p>
            Review your BudgetFlow export before anything reaches the ledger.
          </p>
        </div>
      </header>
      <div className="notice">
        This workspace stages rows only. No transactions are imported. Match
        account names and reconcile balances before committing through the
        financial API.
      </div>
      <section className="surface">
        <h2>1. Map & inspect your CSV</h2>
        <p className="muted">
          Use headers date, amount, description, account, type. Dates must be
          YYYY-MM-DD; amounts must be positive decimals. Unknown export layouts
          need explicit mapping.
        </p>
        <label className="text-button">
          Choose CSV
          <input
            aria-label="Choose CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2000000) {
                setError("Choose a CSV smaller than 2 MB");
                return;
              }
              setSource(await file.text());
              setRows([]);
            }}
          />
        </label>
        <textarea
          aria-label="CSV source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setRows([]);
          }}
          style={{
            width: "100%",
            height: 170,
            border: "1px solid #dde3d8",
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            fontFamily: "monospace",
          }}
          placeholder={example}
        />
        <button className="solid-button" onClick={stage}>
          Preview rows
        </button>
        {error && (
          <p role="alert" className="notice" style={{ marginTop: 15 }}>
            {error}
          </p>
        )}
      </section>
      {rows.length > 0 && (
        <section className="surface" style={{ marginTop: 20 }}>
          <h2>2. Review reconciliation exceptions</h2>
          <p className="muted" style={{ margin: "12px 0" }}>
            0 imported · {counts.ready} valid candidates · {counts.duplicate}{" "}
            duplicate candidates · {counts.exception} exceptions
          </p>
          <p className="muted">
            Duplicate detection here compares this file only. Existing-ledger
            reconciliation is still required; valid candidates are not approval
            to import.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                fontSize: 12,
                textAlign: "left",
                marginTop: 20,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Row",
                    "Date / account",
                    "Description",
                    "Amount",
                    "Review",
                  ].map((h) => (
                    <th style={{ padding: 10 }} key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} style={{ borderTop: "1px solid #e4e8df" }}>
                    <td style={{ padding: 10 }}>{r.row}</td>
                    <td>
                      {r.date}
                      <br />
                      <small>{r.account}</small>
                    </td>
                    <td>{r.description}</td>
                    <td>{r.amount}</td>
                    <td style={{ padding: 10, maxWidth: 250 }}>
                      <b>
                        {r.status === "ready" ? "Valid candidate" : r.status}
                      </b>
                      <br />
                      <small>
                        {r.reason ?? "Map account & category, then reconcile"}
                      </small>
                      {r.status === "duplicate" && (
                        <details>
                          <summary>Compare source rows</summary>
                          {rows
                            .filter(
                              (other) => other.fingerprint === r.fingerprint,
                            )
                            .map((other) => (
                              <p key={other.row}>
                                Row {other.row}: {other.date} · {other.account}{" "}
                                · {other.description} · {other.amount}
                              </p>
                            ))}
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
