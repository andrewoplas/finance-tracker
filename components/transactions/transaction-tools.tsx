"use client";
import { useMemo, useState } from 'react';
import { type FrequentTransaction } from '@/lib/actions/frequent-transactions';
import { QuickActions } from './quick-actions';
import { AiTransactionDialog } from './ai-transaction-dialog';
import { SmsWorkspace } from '@/components/sms/sms-workspace';
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';
import type { OverviewData } from '@/components/dashboard/monthly-overview';
export function TransactionTools({ entries, accounts, categories }: Pick<OverviewData, 'entries' | 'accounts'> & { categories: { id: string; name: string }[] }) {
  const frequent = useMemo(() => {
    const grouped = new Map<string, FrequentTransaction>();
    const categoryNames = new Map(categories.map(c => [c.id, c.name]));
    const accountNames = new Map(accounts.map(a => [a.id, a.name]));
    for (const entry of entries) {
      if (entry.type === 'transfer' || entry.reversed_at) continue;
      const key = JSON.stringify([entry.description, entry.amount, entry.type, entry.category_id, entry.account_id]);
      const existing = grouped.get(key);
      if (existing) existing.frequency++;
      else grouped.set(key, {
        description: entry.description ?? '', amount: Number(entry.amount), type: entry.type,
        category_id: entry.category_id, category_name: categoryNames.get(entry.category_id ?? '') ?? null,
        category_icon: null, category_color: null, account_id: entry.account_id,
        account_name: accountNames.get(entry.account_id ?? '') ?? null, frequency: 1,
      });
    }
    return [...grouped.values()].sort((a, b) => b.frequency - a.frequency).slice(0, 5);
  }, [entries, accounts, categories]);
  const [review, setReview] = useState(false);
  return <div className="transaction-tools">
    <div className="workflow-actions"><button className="solid-button" onClick={() => { const url = new URL(window.location.href); url.searchParams.set('entry', '1'); window.history.pushState(null, '', url); }}>Add transaction</button><AiTransactionDialog /></div>
    <QuickActions frequentTransactions={frequent} historyLabel="Based on transactions in the selected month" />
    <details className="surface" onToggle={event => setReview(event.currentTarget.open)}><summary>Review incoming purchases</summary>{review && <><SmsWorkspace /><QuickLogWorkspace /></>}</details>
  </div>;
}
