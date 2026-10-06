"use client";
import Link from "next/link";
import { Wallet } from "@/types/database";
import { formatCurrency } from "@/lib/constants";
export function WalletList({
  wallets,
}: {
  wallets: Wallet[];
  totalBalance?: number;
}) {
  if (!wallets.length)
    return (
      <div className="surface">
        <h2>No wallets yet</h2>
        <p className="muted">Create a wallet to organize your spending.</p>
      </div>
    );
  return (
    <div className="balance-grid">
      {wallets.map((wallet) => (
        <article className="surface" key={wallet.id}>
          <h2>
            {wallet.icon} {wallet.name}
          </h2>
          <p style={{ fontSize: 26, margin: "16px 0" }}>
            {wallet.opening_balance === null ? 'Unknown' : formatCurrency(Number(wallet.balance))}
          </p>
          <p className="muted">
            {wallet.opening_balance === null
              ? "Opening balance needs reconciliation."
              : "Ledger cache with an opening baseline."}
          </p>
          <Link className="text-button" href="/dashboard/plans#reconcile">
            Reconcile from a counted balance →
          </Link>
          <p className="muted">
            Corrections retain their reason and before/after balances. Money
            received or spent belongs in activity.
          </p>
        </article>
      ))}
    </div>
  );
}
