"use client";
import { usePathname, useSearchParams } from 'next/navigation';
import { MonthlyLink } from '@/components/dashboard/monthly-link';
export function PlanningTabs({ demo = false }: { demo?: boolean }) {
  const path = usePathname(), search = useSearchParams(), base = demo ? '/demo' : '/dashboard';
  const month = search.get('month');
  const suffix = month ? `?month=${month}` : '';
  const links = [
    { label: 'Spending plan', href: `${base}?view=analysis${month ? `&month=${month}` : ''}`, active: path === base },
    ...(!demo ? [{ label: 'Budgets', href: `${base}/budgets${suffix}`, active: path.endsWith('/budgets') }] : []),
    { label: 'Installments', href: `${base}/plans${suffix}`, active: path.endsWith('/plans') },
    ...(!demo ? [{ label: 'Recurring', href: `${base}/recurring${suffix}`, active: path.endsWith('/recurring') }] : []),
  ];
  return <nav className="workspace-tabs destination-tabs" aria-label="Planning sections">{links.map(link => <MonthlyLink key={link.label} href={link.href} aria-current={link.active ? 'page' : undefined}>{link.label}</MonthlyLink>)}</nav>;
}
