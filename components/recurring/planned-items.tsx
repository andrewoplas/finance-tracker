import { CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/constants';

type PlannedItem = {
  id: string;
  description: string;
  type: string;
  amount: number | string;
  source_date_label: string | null;
  confirmed_date: string | null;
  cadence: string | null;
  remaining_count: number | null;
  tag_names: string[] | null;
  account: unknown;
};

export function PlannedItemsSection({ items = [], error = false }: { items?: PlannedItem[]; error?: boolean }) {
  return (
    <section className="surface workflow-section plans-upcoming" id="planned" aria-labelledby="upcoming-heading">
      <div className="section-heading plans-section-heading">
        <div className="plans-section-title"><CalendarDays size={20} aria-hidden="true" /><h2 id="upcoming-heading">Upcoming reminders</h2></div>
        <span className="plans-badge">Not posted</span>
      </div>
      <p className="muted">A place for future plans. Reminders won’t post automatically or change your balances.</p>
      {error ? <p role="status">Plans could not load. Please refresh to try again.</p>
        : items.length > 500 ? <p role="alert">Too many plans for this view; partial results are not shown.</p>
        : !items.length ? <div className="plans-reminder-empty"><CalendarDays size={20} aria-hidden="true" /><div><h3>No upcoming reminders</h3><p>Source plans will appear here when available, ready for you to confirm their dates.</p></div></div>
        : <div className="plans-reminder-list">{items.map((item) => (
          <article className="workflow-item plans-reminder" key={item.id}>
            <div className="section-heading"><h3>{item.description}</h3><b>{item.type === 'expense' ? '−' : '+'}{formatCurrency(Number(item.amount))}</b></div>
            <div className="plans-reminder-meta">
              {(item.account as { name?: string } | null)?.name && <span>{(item.account as { name: string }).name}</span>}
              <span>{item.confirmed_date ?? item.source_date_label ?? 'Date to confirm'}</span>
              {!item.confirmed_date && <span className="plans-badge">Date needs confirmation</span>}
              <span>{item.cadence ?? 'Cadence to confirm'}</span>
              {item.remaining_count !== null && <span>{item.remaining_count} remaining</span>}
            </div>
            {!!item.tag_names?.length && <div className="transaction-tags">{item.tag_names.map((name) => <span key={name}>#{name}</span>)}</div>}
          </article>
        ))}</div>}
    </section>
  );
}

export async function PlannedItems() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db.from('planned_items')
    .select('id,description,type,amount,source_date_label,confirmed_date,cadence,remaining_count,tag_names,account:accounts(name)')
    .eq('user_id', user.id).order('created_at').limit(501);
  return <PlannedItemsSection items={data ?? []} error={!!error} />;
}
