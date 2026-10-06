import { createClient } from "@/lib/supabase/server";
import { financialOperation } from "@/lib/finance/operation-service";
import {
  manilaToday,
  monthlyReport,
  monthOnly,
  type LedgerEntry,
} from "@/lib/finance/core";
import { NextResponse } from "next/server";
import { z } from "zod";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return json({ error: "Database not configured" }, 503);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { action } = await context.params;
  const url = new URL(request.url);
  if (action === "context") {
    const results = await Promise.all(
      ["accounts", "categories", "wallets"].map((table) =>
        db.from(table).select("*").eq("user_id", user.id),
      ),
    );
    if (results.some((r) => r.error))
      return json({ error: "Context unavailable" }, 503);
    return json({
      timezone: "Asia/Manila",
      currency: "PHP",
      today: manilaToday(),
      accounts: results[0].data,
      categories: results[1].data,
      wallets: results[2].data,
      integration:
        "Session-authenticated API; no external connector configured",
    });
  }
  if (action === "workspace") {
    const tables = [
      "accounts",
      "wallets",
      "categories",
      "transactions",
      "installment_plans",
      "installment_balances",
      "installment_payments",
      "receivable_balances",
      "receivable_collections",
      "import_batches",
      "balance_reconciliations",
    ];
    const responses = await Promise.all(
      tables.map((table) =>
        db.from(table).select("*").eq("user_id", user.id).limit(1001),
      ),
    );
    if (responses.some((r) => r.error))
      return json(
        { error: "Workflow data unavailable. Check the reviewed migrations." },
        503,
      );
    if (responses.some((r) => r.data!.length > 1000))
      return json(
        {
          error:
            "Workspace exceeds this view's limit; no partial data returned.",
        },
        422,
      );
    return json(
      Object.fromEntries(tables.map((table, i) => [table, responses[i].data])),
    );
  }
  if (action === "audit") {
    const id = z.uuid().safeParse(url.searchParams.get("id"));
    if (!id.success) return json({ error: "Invalid transaction id" }, 400);
    const { data, error } = await db
      .from("financial_audit")
      .select("*")
      .eq("user_id", user.id)
      .eq("transaction_id", id.data)
      .order("id", { ascending: false })
      .limit(25);
    return error
      ? json({ error: "Audit unavailable" }, 503)
      : json({ items: data });
  }
  if (action === "search" || action === "report") {
    const month = monthOnly.safeParse(url.searchParams.get("month"));
    if (!month.success) return json({ error: "Valid month required" }, 400);
    const { data, error } = await db
      .from(action === "report" ? "finance_report_rows" : "transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("report_month", month.data)
      .limit(1001);
    if (error)
      return json(
        { error: "Ledger unavailable; migration may be required" },
        503,
      );
    if (data.length > 1000)
      return json(
        {
          error:
            "Month exceeds supported report size; no partial totals returned",
        },
        422,
      );
    const entries = data
      .map((row) => (action === "report" ? row.entry : row))
      .map((t) => ({
        ...t,
        amount: String(t.amount),
        personal_amount: String(t.personal_amount),
      })) as LedgerEntry[];
    return json(
      action === "report"
        ? monthlyReport(entries, month.data)
        : { items: entries, complete: true },
    );
  }
  return json({ error: "Unknown contract" }, 404);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return json({ error: "Database not configured" }, 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Origin rejected" }, 403);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { action } = await context.params;
  if (!["preview", "commit", "retro"].includes(action))
    return json({ error: "Unknown contract" }, 404);
  const text = await request.text();
  if (text.length > 100000) return json({ error: "Request too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (action === "retro") {
    const parsed = z
      .object({ month: monthOnly, notes: z.string().max(5000) })
      .strict()
      .safeParse(body);
    if (!parsed.success) return json({ error: "Invalid plan" }, 400);
    const { error } = await db.from("retro_plans").upsert({
      user_id: user.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    });
    return error
      ? json({ error: "Could not save plan" }, 503)
      : json({ saved: true });
  }
  return financialOperation(action, body, request.headers.get("x-finance-preview"),
    async args => { const result = await db.rpc("commit_financial_operation", args); return {data: result.data, error: result.error}; },
  );
}
