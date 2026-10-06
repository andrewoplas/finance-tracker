import { z } from "zod";

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");
export const monthOnly = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function minor(amount: string): number {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(amount))
    throw new Error("Use a nonnegative decimal with at most two places");
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function decimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid minor units");
  return `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}
export const amountSchema = z.string().refine((value) => {
  try {
    return minor(value) > 0;
  } catch {
    return false;
  }
}, "Positive decimal amount required");
export const entrySchema = z
  .object({
    account_id: z.uuid(),
    category_id: z.uuid().nullable().default(null),
    wallet_id: z.uuid().nullable().default(null),
    type: z.enum(["income", "expense", "transfer"]),
    amount: amountSchema,
    description: z.string().trim().min(1).max(300),
    date: dateOnly,
    bill_date: dateOnly.nullable().default(null),
    paid_date: dateOnly.nullable().default(null),
    report_month: monthOnly,
    to_account_id: z.uuid().nullable().default(null),
    attribution: z
      .enum(["personal", "shared", "reimbursable"])
      .default("personal"),
    personal_amount: z.string().default("0.00"),
    review_status: z.enum(["pending", "reviewed"]).default("pending"),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.type === "transfer"
        ? !entry.to_account_id || entry.to_account_id === entry.account_id
        : entry.to_account_id !== null
    )
      ctx.addIssue({
        code: "custom",
        message: "Transfers require distinct source and destination accounts",
        path: ["to_account_id"],
      });
    try {
      const share = minor(entry.personal_amount);
      if (
        share > minor(entry.amount) ||
        (entry.type !== "expense" && share !== 0)
      )
        throw new Error();
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Personal share must be between zero and total (expenses only)",
        path: ["personal_amount"],
      });
    }
  });
export type Entry = z.infer<typeof entrySchema>;
export type LedgerEntry = Entry & {
  id: string;
  revision: number;
  reversed_at?: string | null;
  report_kind?: "transaction" | "installment" | "collection";
};
export function monthlyReport(entries: LedgerEntry[], month: string) {
  monthOnly.parse(month);
  const rows = entries.filter(
    (t) => t.report_month === month && !t.reversed_at,
  );
  const sum = (type: Entry["type"]) =>
    rows
      .filter((t) => t.type === type && t.report_kind !== "collection")
      .reduce((n, t) => n + minor(t.amount), 0);
  const collected = rows
    .filter((t) => t.report_kind === "collection")
    .reduce((n, t) => n + minor(t.amount), 0);
  const income = sum("income"),
    spending = sum("expense");
  const personal = rows
    .filter((t) => t.type === "expense")
    .reduce(
      (n, t) =>
        n +
        (t.attribution === "personal"
          ? minor(t.amount)
          : minor(t.personal_amount)),
      0,
    );
  return {
    month,
    income,
    spending,
    personal,
    recoverable: spending - personal,
    collected,
    net: income + collected - spending,
    transfers: sum("transfer"),
    count: rows.length,
  };
}
// Integer allocation keeps the purchase total exact; schedules are commitments, not expenses.
export function installments(amount: string, count: number, firstDate: string) {
  dateOnly.parse(firstDate);
  if (!Number.isInteger(count) || count < 1 || count > 120)
    throw new Error("Invalid installment count");
  const total = minor(amount),
    base = Math.floor(total / count),
    remainder = total % count;
  const [year, month, day] = firstDate.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(Date.UTC(year, month + index, 0));
    const date = new Date(
      Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        Math.min(day, end.getUTCDate()),
      ),
    )
      .toISOString()
      .slice(0, 10);
    return { date, amount: decimal(base + (index < remainder ? 1 : 0)) };
  });
}
