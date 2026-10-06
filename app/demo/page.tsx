import { MonthlyOverview } from "@/components/dashboard/monthly-overview";
import { demoEntries, demoCategories } from "@/lib/finance/demo";
import { monthOnly } from "@/lib/finance/core";
import Link from "next/link";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarDays,
} from "lucide-react";
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; filter?: string }>;
}) {
  const query = await searchParams;
  const month = monthOnly.safeParse(query.month).success
    ? query.month!
    : "2026-10";
  return (
    <div className="demo-shell">
      <aside className="demo-sidebar">
        <Link className="demo-logo" href="/demo">Finance</Link>
        <nav aria-label="Main navigation">
          <Link className={!query.view || query.view === "overview" ? "active" : ""} href={`/demo?month=${month}`}><LayoutDashboard size={18}/> Overview</Link>
          <Link className={query.view === "transactions" ? "active" : ""} href={`/demo?month=${month}&view=transactions`}><ArrowLeftRight size={18}/> Transactions</Link>
          <Link className={query.view === "analysis" ? "active" : ""} href={`/demo?month=${month}&view=analysis`}><CalendarDays size={18}/> Spending plan</Link>
          <div className="nav-secondary-label">Tools</div>
          <Link href="/demo/plans">Plans & shared money</Link>
          <Link href="/demo/import">Import CSV</Link>
          <Link href={`/demo?month=${month}&view=reflection`}>Monthly reflection</Link>
        </nav>
        <div className="sidebar-note"><small>Synthetic preview<br/>No account connected</small><Link href="/login">Sign in</Link></div>
      </aside>
      <main>
        <MonthlyOverview
          key={`${month}-${query.view}-${query.filter}`} view={["overview", "transactions", "analysis", "reflection"].includes(query.view ?? "") ? query.view : "overview"} initialFilter={query.filter}
          demo
          month={month}
          data={{
            entries: demoEntries(month),
            categories: demoCategories,
            accounts: [
              {
                id: "10000000-0000-4000-8000-000000000001",
                name: "Everyday account",
              },
            ],
            commitments: [
              {
                id: "1",
                description: "Internet",
                amount: "1699",
                next_date: `${month}-25`,
              },
              {
                id: "2",
                description: "Music subscription",
                amount: "149",
                next_date: `${month}-28`,
              },
            ],
            loadedAt: "Demo",
          }}
        />
      </main>

    </div>
  );
}
