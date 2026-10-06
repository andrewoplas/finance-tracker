"use client";
import { useCallback, useEffect, useState } from "react";
import type { Entry } from "./core";
export type WorkspaceAccount = {
  id: string;
  name: string;
  type?: string;
  balance: string | number;
  opening_balance: string | number | null;
  revision: number;
  is_archived?: boolean;
};
export type WorkspaceTransaction = Entry & { id: string; revision: number };
export type InstallmentPlan = {
  id: string;
  transaction_id: string;
  reporting_basis: "purchase" | "billing";
  revision: number;
};
export type InstallmentItem = {
  id: string;
  plan_id: string;
  sequence: number;
  bill_date: string;
  due_date: string;
  report_month: string;
  amount: string | number;
  paid: string | number;
  remaining: string | number;
};
export type Receivable = {
  id: string;
  transaction_id: string;
  counterparty: string;
  amount: string | number;
  collected: string | number;
  outstanding: string | number;
  revision: number;
};
export type ImportBatch = {
  id: string;
  name: string;
  revision: number;
  state: "staged" | "committed";
  rows: {
    source_row: number;
    source: string;
    entry: Entry | null;
    status: "ready" | "duplicate" | "exception";
    reason?: string;
    matches?: {
      id?: string;
      date?: string;
      description?: string;
      amount?: string;
      source?: string;
    }[];
  }[];
  result?: {
    transactions: WorkspaceTransaction[];
    decisions: { source_row: number; decision: string }[];
  };
};
export type Workspace = {
  accounts: WorkspaceAccount[];
  wallets: WorkspaceAccount[];
  categories: { id: string; name: string; type: string }[];
  transactions: WorkspaceTransaction[];
  installment_plans: InstallmentPlan[];
  installment_balances: InstallmentItem[];
  installment_payments: {
    id: string;
    item_id: string;
    transaction_id: string;
  }[];
  receivable_balances: Receivable[];
  receivable_collections: {
    id: string;
    receivable_id: string;
    transaction_id: string;
  }[];
  import_batches: ImportBatch[];
  balance_reconciliations: {
    id: string;
    target_id: string;
    target_type: string;
    as_of_date: string;
    observed_balance: number | string;
    reason: string;
    before_row: WorkspaceAccount;
    after_row: WorkspaceAccount;
    created_at: string;
  }[];
};
export const emptyWorkspace: Workspace = {
  accounts: [],
  wallets: [],
  categories: [],
  transactions: [],
  installment_plans: [],
  installment_balances: [],
  installment_payments: [],
  receivable_balances: [],
  receivable_collections: [],
  import_batches: [],
  balance_reconciliations: [],
};
export function useFinanceWorkspace(demo = false) {
  const [data, setData] = useState<Workspace | null>(
      demo ? emptyWorkspace : null,
    ),
    [error, setError] = useState(""),
    [loadedAt, setLoadedAt] = useState("");
  const refresh = useCallback(async () => {
    if (demo) return;
    try {
      const response = await fetch("/api/finance/workspace", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      setLoadedAt(new Date().toLocaleTimeString());
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not refresh workflow data",
      );
    }
  }, [demo]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, error, loadedAt, refresh };
}
