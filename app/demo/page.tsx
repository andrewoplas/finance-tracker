import { MonthlyOverview } from "@/components/dashboard/monthly-overview";
import { demoEntries, demoCategories } from "@/lib/finance/demo";
import { monthOnly } from "@/lib/finance/core";
import Link from "next/link";
import {
  Leaf,
  LayoutDashboard,
  ArrowLeftRight,
  CalendarDays,
  Settings2,
} from "lucide-react";
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const query = await searchParams;
  const month = monthOnly.safeParse(query.month).success
    ? query.month!
    : "2026-10";
  return (
    <div className="demo-shell">
      <aside className="demo-sidebar">
        <Link className="demo-logo" href="/demo">
          <Leaf /> ledger<span>Personal finance, considered.</span>
        </Link>
        <nav>
          <Link className="active" href={`/demo?month=${month}`}>
            <LayoutDashboard size={18} /> Overview
          </Link>
          <a href="#activity">
            <ArrowLeftRight size={18} /> Activity
          </a>
          <Link href="/demo/import">
            <CalendarDays size={18} /> Import studio
          </Link>
          <Link href="/login">
            <Settings2 size={18} /> Sign in
          </Link>
        </nav>
        <div className="sidebar-note">
          <span className="soft-badge">PREVIEW</span>
          <p>A calmer place to understand your money.</p>
          <small>
            Synthetic data only.
            <br />
            No account connection.
          </small>
        </div>
      </aside>
      <main>
        <MonthlyOverview
          key={month}
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
      <nav className="demo-mobile-nav">
        <Link href="/demo">
          <LayoutDashboard size={18} />
          Overview
        </Link>
        <a href="#activity">
          <ArrowLeftRight size={18} />
          Activity
        </a>
        <Link href="/demo/import">
          <CalendarDays size={18} />
          Import
        </Link>
        <Link href="/login">
          <Settings2 size={18} />
          Sign in
        </Link>
      </nav>
    </div>
  );
}
