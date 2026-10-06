import type { LedgerEntry } from "./core";
const account = "10000000-0000-4000-8000-000000000001";
const categories = [
  "Groceries",
  "Dining",
  "Transport",
  "Home",
  "Subscriptions",
];
export const demoCategories = categories.map((name, i) => ({
  id: `20000000-0000-4000-8000-00000000000${i}`,
  name,
  amount: ["6000", "4000", "2500", "14000", "1500"][i],
}));
export function demoEntries(month: string): LedgerEntry[] {
  return [
    ["01", "Monthly salary", "55000", "income", null],
    ["02", "Apartment rent", "12000", "expense", 3],
    ["03", "Weekend groceries", "2340.50", "expense", 0],
    ["05", "Lunch with friends", "1250", "expense", 1],
    ["06", "Ride home", "285", "expense", 2],
    ["08", "Music subscription", "149", "expense", 4],
    ["10", "Fresh market", "1875.25", "expense", 0],
    ["12", "Coffee & catch-up", "460", "expense", 1],
    ["14", "Internet bill", "1699", "expense", 3],
    ["16", "Dinner with team", "2400", "expense", 1],
    ["18", "Train card top-up", "500", "expense", 2],
    ["20", "Weekly groceries", "1980", "expense", 0],
    ["21", "Move to savings", "8000", "transfer", null],
  ].map(([day, description, amount, type, category], i) => ({
    id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    revision: 1,
    account_id: account,
    category_id: category === null ? null : demoCategories[Number(category)].id,
    wallet_id: null,
    type: type as LedgerEntry["type"],
    amount: String(amount),
    description: String(description),
    date: `${month}-${day}`,
    report_month: month,
    bill_date: null,
    paid_date: null,
    to_account_id:
      type === "transfer" ? "10000000-0000-4000-8000-000000000002" : null,
    attribution: i === 9 ? "reimbursable" : "personal",
    personal_amount: i === 9 ? "800.00" : "0.00",
    review_status: i === 9 || i === 11 ? "pending" : "reviewed",
  }));
}
