import { minor } from "./core";

type AccountBalance = {
  balance: string | number | null;
  opening_balance: string | number | null;
  is_archived: boolean;
};
export type NetWorth = {
  status: "ready" | "unknown" | "empty";
  assets: number;
  debts: number;
  total: number;
  accountCount: number;
  unknownCount: number;
};

// Account balances already carry their sign. Wallet allocations and installment
// schedules must not be added again: they represent money already in accounts.
export function netWorth(accounts: AccountBalance[]): NetWorth {
  let assets = 0, debts = 0, accountCount = 0, unknownCount = 0;
  for (const account of accounts) {
    if (account.is_archived) continue;
    accountCount++;
    if (account.opening_balance == null || account.balance == null) {
      unknownCount++;
      continue;
    }
    try {
      const value = String(account.balance);
      if (value.startsWith("-")) debts += minor(value.slice(1));
      else assets += minor(value);
    } catch {
      unknownCount++;
    }
  }
  const status = !accountCount ? "empty" : unknownCount ? "unknown" : "ready";
  // Never expose a partial sum as a complete net worth.
  return { status, accountCount, unknownCount,
    assets: status === "ready" ? assets : 0,
    debts: status === "ready" ? debts : 0,
    total: status === "ready" ? assets - debts : 0,
  };
}
