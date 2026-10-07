import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/constants';
export async function PlannedItems() {
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const {data,error}=await db.from('planned_items').select('id,description,type,amount,source_date_label,confirmed_date,cadence,remaining_count,tag_names,account:accounts(name)').eq('user_id',user.id).order('created_at').limit(501);
 return <section className="surface" id="planned"><h2>Upcoming plans · not posted</h2><p className="muted">Source reminders only. Dates and cadence need confirmation; these do not affect balances or spending reports and will not post automatically.</p>{error?<p role="status">Plans could not load. Please try again shortly.</p>:data.length>500?<p role="alert">Too many plans for this view; partial results are not shown.</p>:!data.length?<p className="empty-copy">No source plans yet.</p>:data.map(item=><article className="workflow-item" key={item.id}><div className="section-heading"><h3>{item.description}</h3><b>{item.type==='expense'?'−':'+'}{formatCurrency(Number(item.amount))}</b></div><p className="muted">{(item.account as unknown as {name:string}|null)?.name} · Source: {item.source_date_label}{!item.confirmed_date?' · Year unconfirmed':''} · Cadence: {item.cadence ?? 'unknown'}{item.remaining_count ? ` · ${item.remaining_count} remaining` : ''}</p><div className="transaction-tags">{item.tag_names?.map((name:string)=><span key={name}>#{name}</span>)}</div></article>)}</section>;
}
