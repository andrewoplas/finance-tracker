import { createClient } from "@/lib/supabase/server";
import {
  manilaToday,
  monthlyReport,
  type LedgerEntry,
} from "@/lib/finance/core";
import Link from "next/link";
const money = (minor: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    minor / 100,
  );
export default async function ReportsPage() {
  const month = manilaToday().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data, error } = await db
    .from("finance_report_rows")
    .select("*")
    .eq("user_id", user?.id)
    .gte("report_month", months[5])
    .lte("report_month", month)
    .limit(1001);
  if (error || !user || !data || data.length > 1000)
    return (
      <div className="surface" role="alert">
        <h2>Reports unavailable</h2>
        <p>
          We could not load a complete ledger. No partial or zero totals are
          shown.
        </p>
        <a className="text-button" href="/dashboard/reports">
          Retry
        </a>
      </div>
    );
  const entries = data
    .map((row) => row.entry)
    .map((t) => ({
      ...t,
      amount: String(t.amount),
      personal_amount: String(t.personal_amount),
    })) as LedgerEntry[];
  return (
    <div className="overview">
      <header className="overview-header">
        <div>
          <div className="eyebrow">YOUR MONTHLY STORY</div>
          <h1>Look back. Plan ahead.</h1>
          <p>Deterministic totals by report month · PHP · Asia/Manila</p>
        </div>
      </header>
      <div className="surface" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, textAlign: "left" }}>
          <thead>
            <tr>
              {[
                "Month",
                "Earned income",
                "Collections",
                "Spending",
                "Personal share",
                "Allocated to others",
                "Net report amount*",
              ].map((h) => (
                <th key={h} style={{ padding: 14 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const r = monthlyReport(entries, month);
              return (
                <tr key={month} style={{ borderTop: "1px solid #e1e5dd" }}>
                  <td style={{ padding: 14 }}>
                    <Link
                      className="text-button"
                      href={`/dashboard?month=${month}`}
                    >
                      {month}
                    </Link>
                  </td>
                  {[
                    r.income,
                    r.collected,
                    r.spending,
                    r.personal,
                    r.recoverable,
                    r.net,
                  ].map((n, i) => (
                    <td key={i}>{money(n)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">
          *Income plus collected reimbursements minus spending on report-month
          basis; this is not a bank balance or a paid-date cashflow statement.
          Transfers and card settlements are excluded from spending. Allocated
          shares do not imply reimbursement has been collected.
        </p>
      </div>
    </div>
  );
}
