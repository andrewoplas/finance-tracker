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
  searchParams: Promise<{ month?: string }>;
}) {
  const query = await searchParams;
  const month = monthOnly.safeParse(query.month).success
    ? query.month!
    : manilaToday().slice(0, 7);
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
    const [transactions, categories, budgets, commitments, accounts, retro] =
      await Promise.all([
        db
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("report_month", month)
          .order("date", { ascending: false })
          .limit(1001),
        db
          .from("categories")
          .select("id,name")
          .eq("user_id", user.id)
          .eq("type", "expense"),
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
        db.from("accounts").select("id,name").eq("user_id", user.id),
        db
          .from("retro_plans")
          .select("notes")
          .eq("user_id", user.id)
          .eq("month", month)
          .maybeSingle(),
      ]);
    if (
      transactions.error ||
      categories.error ||
      budgets.error ||
      accounts.error
    )
      throw new Error(
        "The ledger is unavailable. The reviewed database migrations may need to be applied.",
      );
    if (transactions.data.length > 1000)
      throw new Error(
        "This month exceeds the supported report size. Partial totals are not shown.",
      );
    data.entries = transactions.data.map((t) => ({
      ...entrySchema.parse({
        account_id: t.account_id,
        category_id: t.category_id,
        wallet_id: t.wallet_id,
        type: t.type,
        amount: String(t.amount),
        description: t.description || "Transaction",
        date: t.date,
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
    data.categories = categories.data.map((c) => ({
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
    data.accounts = accounts.data;
    data.commitments = (commitments.data ?? []).map((c) => ({
      ...c,
      description: c.description || "Scheduled transaction",
      amount: String(c.amount),
    }));
    data.retro = retro.data?.notes;
    if (commitments.error || retro.error)
      data.partial =
        "Spending loaded. Commitments or saved reflection could not load; those sections may be incomplete.";
  } catch (error) {
    data.error =
      error instanceof Error ? error.message : "Could not load overview.";
  }
  return <MonthlyOverview key={month} month={month} data={data} />;
}
