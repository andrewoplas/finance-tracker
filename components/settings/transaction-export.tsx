"use client";

import { SettingsHeading } from "./settings-heading";
import { useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { manilaToday, monthOnly } from "@/lib/finance/core";

type ExportRow = {
  date: string;
  time: string | null;
  type: string;
  amount: string | number;
  description: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
};

export function TransactionExport({ userId }: { userId: string }) {
  const [month, setMonth] = useState(() => manilaToday().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (!monthOnly.safeParse(month).success || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await createClient().from("transactions")
        .select("date,time,type,amount,description,category:categories(name),account:accounts!transactions_account_id_fkey(name)")
        .eq("user_id", userId).eq("report_month", month)
        .order("date", { ascending: false }).order("time", { ascending: false, nullsFirst: false })
        .limit(1001).returns<ExportRow[]>();
      if (error) throw new Error("Could not export transactions. Please try again.");
      if (data.length > 1000) throw new Error("This month exceeds the 1,000-transaction export limit. No partial file was downloaded.");
      if (!data.length) { setMessage("No transactions in this report month."); return; }
      // Quote every cell and prevent descriptions/names from becoming spreadsheet formulas.
      const quote = (value: string) => {
        const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const rows = [["Date", "Time (Manila)", "Type", "Amount", "Category", "Account", "Description"],
        ...data.map(row => [row.date, row.time ?? "", row.type, String(row.amount), row.category?.name ?? "", row.account?.name ?? "", row.description ?? ""])];
      const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions-${month}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Downloaded ${data.length} ${data.length === 1 ? "transaction" : "transactions"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export transactions.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="surface" aria-labelledby="export-title">
    <SettingsHeading icon="export" id="export-title" title="Export transactions" description="Download a CSV of your transactions for a report month." />
    <form className="settings-export-form" onSubmit={download}>
      <label className="workflow-field">Report month<input type="month" value={month} onChange={event => setMonth(event.target.value)} required disabled={busy} /></label>
      <button className="solid-button" type="submit" disabled={busy || !monthOnly.safeParse(month).success}><Download size={16} aria-hidden="true" />{busy ? "Preparing…" : "Download CSV"}</button>
    </form>
    {message && <p className="muted" role="status">{message}</p>}
  </section>;
}
