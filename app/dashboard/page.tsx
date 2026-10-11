import { isReportYear, loadYearReport } from "@/lib/finance/year-report";
import { netWorth } from "@/lib/finance/net-worth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MonthlyOverview,
  type OverviewData,
} from "@/components/dashboard/monthly-overview";
import {
  entrySchema,
  manilaToday,
  monthOnly,
  minor,
  decimal,
  type LedgerEntry,
} from "@/lib/finance/core";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string; filter?: string }>;
}) {
  const query = await searchParams;
  const year = isReportYear(query.year) && (!query.view || query.view === "overview") ? query.year : undefined;
  const month = monthOnly.safeParse(query.month).success
    ? query.month!
    : manilaToday().slice(0, 7);
  if (query.view === "reflection") redirect(`/dashboard/reports?month=${month}`);
  const data: OverviewData = {
    entries: [],
    categories: [],
    commitments: [],
    accounts: [],
    loadedAt: new Date().toISOString(),
  };
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error("Sign in to load your overview.");
    if (year) {
      const [categories, accounts, rows, recent] = await Promise.all([
        db.from("categories").select("id,name,type").eq("user_id", user.id),
        db.from("accounts").select("id,name,balance,opening_balance,is_archived").eq("user_id", user.id).limit(1001),
        loadYearReport(async offset => {
          const result = await db.from("finance_report_rows")
            .select("entry", { count: offset === 0 ? "exact" : undefined })
            .eq("user_id", user.id).gte("report_month", `${year}-01`).lte("report_month", `${year}-12`)
            .order("report_month").order("entry->>id").range(offset, offset + 999);
          return { rows: (result.data ?? []).map(row => row.entry) as LedgerEntry[], count: result.count, error: !!result.error };
        }),
        db.from("transactions").select("*").eq("user_id", user.id)
          .gte("report_month", `${year}-01`).lte("report_month", `${year}-12`).is("reversed_at", null)
          .order("date", { ascending: false }).order("time", { ascending: false, nullsFirst: false }).order("id").limit(5),
      ]);
      if (recent.error || categories.error || accounts.error || !accounts.data || accounts.data.length > 1000) throw new Error("The yearly overview could not load completely.");
      data.transactionCategories = categories.data ?? [];
      data.reportEntries = rows;
      data.entries = recent.data ?? [];
      data.accounts = accounts.data.map(({ id, name }) => ({ id, name }));
      data.netWorth = netWorth(accounts.data);
      return <MonthlyOverview key={year} year={year} month={month} data={data} />;
    }

    const [
      transactions,
      categories,
      budgets,
      commitments,
      accounts,
      reporting,
      installments,
      tags,
    ] = await Promise.all([
      db
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("report_month", month)
        .order("date", { ascending: false })
        .limit(1001),
      db
        .from("categories")
        .select("id,name,type")
        .eq("user_id", user.id),
      db
        .from("budgets")
        .select("*")
        .eq("user_id", user.id)
        .eq("period", "monthly"),
      db
        .from("recurring_transactions")
        .select("id,description,amount,next_date")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gte("next_date", manilaToday())
        .order("next_date")
        .limit(4),
      db.from("accounts").select("id,name,balance,opening_balance,is_archived").eq("user_id", user.id).limit(1001),
      db
        .from("finance_report_rows")
        .select("entry")
        .eq("user_id", user.id)
        .eq("report_month", month)
        .limit(1001),
      db
        .from("installment_balances")
        .select("id,due_date,remaining")
        .eq("user_id", user.id)
        .gt("remaining", 0)
        .order("due_date")
        .limit(4),
      db.from("tags").select("id,name").eq("user_id", user.id).order("name").limit(501),
    ]);
    if (
      reporting.error ||
      transactions.error ||
      categories.error ||
      budgets.error ||
      accounts.error
    )
      throw new Error(
        "The ledger is unavailable. The reviewed database migrations may need to be applied.",
      );
    if (transactions.data.length > 1000 || reporting.data!.length > 1000)
      throw new Error(
        "This month exceeds the supported report size. Partial totals are not shown.",
      );
    if (accounts.data.length > 1000) throw new Error("Too many accounts to load a complete overview. Partial net worth is not shown.");
    data.entries = transactions.data.map((t) => ({
      ...entrySchema.parse({
        account_id: t.account_id,
        tag_ids: t.tag_ids,
        category_id: t.category_id,
        wallet_id: t.wallet_id,
        type: t.type,
        amount: String(t.amount),
        description: t.description || "Transaction",
        date: t.date,
        time: t.time ?? null,
        bill_date: t.bill_date,
        paid_date: t.paid_date,
        report_month: t.report_month,
        to_account_id: t.to_account_id,
        attribution: t.attribution,
        personal_amount: String(t.personal_amount),
        review_status: t.review_status,
      }),
      id: t.id,
      revision: t.revision,
    })) as LedgerEntry[];
    data.transactionCategories = categories.data;
    data.categories = categories.data.filter(c => c.type === "expense").map((c) => ({
      ...c,
      amount: decimal(
        budgets.data
          .filter(
            (b) =>
              b.category_id === c.id &&
              (!b.start_date || b.start_date <= `${month}-01`),
          )
          .reduce((n, b) => n + minor(String(b.amount)), 0),
      ),
    }));
    data.reportEntries = reporting.data!.map((r) => r.entry) as LedgerEntry[];
    data.accounts = accounts.data.map(({ id, name }) => ({ id, name }));
    data.netWorth = netWorth(accounts.data);
    data.tags = tags.error || (tags.data?.length ?? 0)>500 ? [] : tags.data ?? [];
    data.tagsAvailable = !tags.error && (tags.data?.length ?? 0)<=500;
    data.commitments = (commitments.data ?? []).map((c) => ({
      ...c,
      description: c.description || "Scheduled transaction",
      amount: String(c.amount),
    }));
    data.commitments = [
      ...data.commitments,
      ...(installments.data ?? []).map((item) => ({
        id: item.id,
        description: "Card installment · remaining due",
        amount: String(item.remaining),
        next_date: item.due_date,
      })),
    ]
      .sort((a, b) => a.next_date.localeCompare(b.next_date))
      .slice(0, 4);
    if (commitments.error || installments.error)
      data.partial =
        "Spending loaded. Commitments could not load; those sections may be incomplete.";
    if (!data.tagsAvailable) data.partial = [data.partial, "Tags could not load. Please try again shortly."].filter(Boolean).join(" ");
  } catch (error) {
    data.error =
      error instanceof Error ? error.message : "Could not load overview.";
  }
  return <MonthlyOverview year={year} key={year ?? month} view={["overview", "transactions", "analysis", "reflection"].includes(query.view ?? "") ? query.view : "overview"} initialFilter={query.filter} month={month} data={data} />;
}
