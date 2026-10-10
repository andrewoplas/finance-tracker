import { MonthlyReflection } from "@/components/reports/monthly-reflection";
import { monthOnly } from "@/lib/finance/core";
import { PageHeading } from "@/components/layout/page-heading";
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
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const query = await searchParams;
  const month = monthOnly.safeParse(query.month).success ? query.month! : manilaToday().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const [{ data, error }, reflection] = await Promise.all([
    db
    .from("finance_report_rows")
    .select("entry")
    .eq("user_id", user?.id)
    .gte("report_month", months[5])
    .lte("report_month", month)
    .limit(1001),
    db.from('retro_plans').select('notes').eq('user_id', user?.id).eq('month', month).maybeSingle(),
  ]);
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
    <div className="brand-page">
      <PageHeading title="Reports" description="Compare monthly totals and revisit your reflections." />
      <form className="report-month-picker" method="GET"><label className="workflow-field">Report month<input type="month" name="month" defaultValue={month} required /></label><button className="solid-button">View month</button></form>
      <MonthlyReflection key={month} month={month} notes={reflection.data?.notes ?? ''} unavailable={!!reflection.error} />
      <div className="surface report-surface">
        <div className="report-table-wrap" role="region" aria-label="Six-month finance report" tabIndex={0}>
        <table className="report-table">
          <caption className="sr-only">Monthly report totals in Philippine pesos</caption>
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
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const r = monthlyReport(entries, month);
              return (
                <tr key={month}>
                  <td>
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
        </div>
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
