/** Never expose a ledger-delta cache as an absolute balance. */
export function withVerifiedBalance<T extends { balance: unknown; opening_balance: unknown }>(account: T) {
  return { ...account, balance: account.opening_balance == null ? null : account.balance,
    reconciliation_status: account.opening_balance == null ? "unknown" : "reconciled" };
}
