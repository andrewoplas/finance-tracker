'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Choice = {id:string;name:string};
type Key = {id:string;account_id:string;last4:string;label:string;expires_at:string;revoked_at:string|null;last_used_at:string|null};
type Receipt = {id:string;account_id:string;last4:string;merchant:string;amount:string|number;received_at:string;sms_date_label:string;transaction_date:string|null;date_issue:string|null;possible_duplicate:boolean;revision:number};
type Workspace = {keys:Key[];inbox:Receipt[];total:number;accounts:Choice[];categories:Choice[];tags:Choice[]};
const money = (value:string|number) => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value));
async function send(action:string,body:unknown) {
 const response=await fetch(`/api/sms/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.error || 'Please try again.');return result;
}
export function SmsWorkspace({setup=false,demo=false}:{setup?:boolean;demo?:boolean}) {
 const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
  try {const response=await fetch('/api/sms/workspace',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error);setData(result);setError('');}
  catch(error){setError(error instanceof Error?error.message:'Could not load SMS inbox.');}
 },[]);
 useEffect(()=>{if(demo){setData({keys:[],accounts:[{id:'20000000-0000-4000-8000-000000000001',name:'Synthetic card'}],categories:[{id:'30000000-0000-4000-8000-000000000001',name:'Synthetic category'}],tags:[{id:'40000000-0000-4000-8000-000000000001',name:'Food'}],total:1,inbox:[{id:'50000000-0000-4000-8000-000000000001',account_id:'20000000-0000-4000-8000-000000000001',last4:'1234',merchant:'SYNTHETIC MARKET',amount:'123.45',received_at:'2026-10-07T03:40:00+08:00',sms_date_label:'10/07 3:38AM (Asia/Manila; no year in SMS)',transaction_date:null,date_issue:'sms_date_unresolved',possible_duplicate:true,revision:1}]});return;}void load();},[load,demo]);
 return <section className="sms-workspace">
  {demo && <p className="notice">Synthetic preview. Saving and key creation are disabled.</p>}
  {setup ? <><h2>Transaction API</h2><p className="muted">Send RCBC purchase messages straight to your <Link href="/dashboard/inbox">SMS inbox</Link>. No AI service is used. Review items in the app before they affect spending.</p></> : <><h2>SMS inbox</h2><p className="muted">Purchases sent by your shortcut or HTTP client. Nothing here counts as spending until you record it.</p><Link className="text-button" href="/dashboard/settings#transaction-api">Set up API access</Link></>}
  {error && <div role="alert" className="notice">{error}<button type="button" className="text-button" onClick={load}>Retry</button></div>}
  {!data && !error && <p role="status">Loading…</p>}
  {message && <p role="status" className="notice">{message}</p>}
  {data && (setup ? <KeySetup keys={data.keys} accounts={data.accounts} onChanged={load} disabled={demo}/> : <>
   <p className="muted">{data.total ? `${data.total} awaiting review${data.total>50 ? ' · Showing the oldest 50' : ''}` : 'Your inbox is clear.'}</p>
   {data.inbox.map(receipt=><ReceiptReview key={receipt.id} receipt={receipt} disabled={demo} categories={data.categories} tags={data.tags} account={data.accounts.find(a=>a.id===receipt.account_id)?.name ?? 'Card account'} onDone={async message=>{setMessage(message);await load();}}/>)}
  </>)}
 </section>;
}
function KeySetup({keys,accounts,onChanged,disabled=false}:{keys:Key[];accounts:Choice[];onChanged:()=>Promise<void>;disabled?:boolean}) {
 const [account,setAccount]=useState(''),[last4,setLast4]=useState(''),[label,setLabel]=useState(''),[acknowledged,setAcknowledged]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[token,setToken]=useState(''),[copied,setCopied]=useState(false);
 async function create(event:React.FormEvent){event.preventDefault();if(disabled)return;setBusy(true);setError('');setToken('');setCopied(false);
  try {const result=await send('create-key',{account_id:account,last4,label,acknowledged});setToken(result.token);setAcknowledged(false);await onChanged();}
  catch(error){setError(error instanceof Error?error.message:'Could not create key.');}finally{setBusy(false);}
 }
 async function revoke(id:string){if(disabled)return;setBusy(true);setError('');try{await send('revoke-key',{id});setToken('');await onChanged();}catch(error){setError(error instanceof Error?error.message:'Could not revoke key.');}finally{setBusy(false);}}
 return <>
  {keys.length>0 && <ul className="sms-keys">{keys.map(key=><li key={key.id}><div><strong>{key.label}</strong><span className="muted">{accounts.find(a=>a.id===key.account_id)?.name ?? 'Card'} · ending {key.last4} · {key.revoked_at?'Revoked':`Expires ${key.expires_at.slice(0,10)}`}</span></div>{!key.revoked_at && <button type="button" className="text-button" disabled={busy} onClick={()=>revoke(key.id)}>Revoke</button>}</li>)}</ul>}
  <details className="inspector-section"><summary><span>Create an inbox key</span></summary>
   <form className="workflow-form sms-key-form" onSubmit={create}>
    <p className="muted">This key can submit purchase messages for one card. It cannot read your ledger, record expenses, or move money. It expires after 90 days and can be revoked here.</p>
    <label className="workflow-field">Credit card<select required value={account} onChange={event=>setAccount(event.target.value)}><option value="">Choose a card</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <div className="inspector-field-row"><label className="workflow-field">Card’s last four digits<input value={last4} onChange={event=>setLast4(event.target.value)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off"/></label><label className="workflow-field">Key label<input value={label} onChange={event=>setLabel(event.target.value)} placeholder="Phone shortcut" maxLength={60} required/></label></div>
    <label className="sms-check"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} required/>I approve inbox-only access for the card and last four digits selected above.</label>
    <button className="solid-button" disabled={disabled||busy||!acknowledged||!account}>{busy?'Working…':'Create key'}</button>
   </form>
  </details>
  {token && <div className="notice"><p>Save this key now. It is shown only once.</p><input aria-label="New API key" className="sms-secret" type="password" value={token} readOnly autoComplete="off"/><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(token);setCopied(true);}catch{setError('Select and copy the key manually.');}}}>{copied?'Copied':'Copy key'}</button><button type="button" className="text-button" onClick={()=>setToken('')}>I saved it</button></div>}
  {error && <p role="alert" className="notice">{error}</p>}
  <details className="inspector-section"><summary><span>HTTP setup</span></summary><div className="inspector-section-content"><p className="muted">POST to <code>/api/v1/card-transactions</code> on this site. Send the key in <code>Authorization: Bearer YOUR_KEY</code>, JSON content type, and a UUID in <code>Idempotency-Key</code>. Keep the same UUID and body when retrying.</p><p className="muted">JSON fields: <code>sms</code> and <code>received_at</code> (the actual receipt timestamp including timezone). Only masked approved-purchase messages are supported. Never send a full card number, CVV, OTP or password.</p><p className="muted">Accepted submissions return <code>needs_review</code> and an inbox ID. Limits: 2,000 bytes per SMS, 10 new requests per minute and 100 per day per key.</p></div></details>
 </>;
}
function ReceiptReview({receipt,categories,tags,account,onDone,disabled=false}:{receipt:Receipt;categories:Choice[];tags:Choice[];account:string;onDone:(message:string)=>Promise<void>;disabled?:boolean}) {
 const [date,setDate]=useState(receipt.transaction_date ?? ''),[month,setMonth]=useState(receipt.transaction_date?.slice(0,7) ?? ''),[category,setCategory]=useState('');
 const [selectedTags,setTags]=useState<string[]>([]),[attribution,setAttribution]=useState('personal'),[share,setShare]=useState('0.00'),[distinct,setDistinct]=useState(false),[checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(action:'record'|'dismiss'){if(disabled)return;setBusy(true);setError('');try{
  const result=await send('review',{id:receipt.id,revision:receipt.revision,action,...(action==='record'?{values:{date,report_month:month,category_id:category==='none'?null:category,tag_ids:selectedTags,attribution,personal_amount:attribution==='personal'?Number(receipt.amount).toFixed(2):share,confirm_distinct:distinct}}:{})});
  await onDone(result.status==='recorded'?`Recorded ${money(receipt.amount)} · ${receipt.merchant}. Receipt ${result.transaction_id}`:`Dismissed ${receipt.merchant}.`);
 }catch(error){setError(error instanceof Error?error.message:'Could not review.');}finally{setBusy(false);}}
 const possible=receipt.possible_duplicate||error.includes('Possible duplicate');
 return <details className="sms-receipt"><summary><span><strong>{receipt.merchant}</strong><small>{account} · ending {receipt.last4}</small></span><b>{money(receipt.amount)}</b></summary>
  <form className="workflow-form" onSubmit={event=>{event.preventDefault();void act('record');}}>
   <p className="muted">SMS: {receipt.sms_date_label}<br/>Received: {new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(receipt.received_at))} Manila</p>
   {receipt.date_issue && <p className="notice">The date could not be resolved safely from this message. Confirm the full purchase date below.</p>}
   {possible && <p className="notice">Another inbox item or ledger entry may be this purchase. Check your transactions before recording it again.</p>}
   <div className="inspector-field-row"><label className="workflow-field">Purchase date<input type="date" value={date} onChange={event=>{setDate(event.target.value);setMonth(event.target.value.slice(0,7));}} required/></label><label className="workflow-field">Report month<input type="month" value={month} onChange={event=>setMonth(event.target.value)} required/></label></div>
   <label className="workflow-field">Category<select required value={category} onChange={event=>setCategory(event.target.value)}><option value="">Choose a category</option><option value="none">Leave uncategorized</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <details className="inspector-section"><summary><span>Tags</span><span className="inspector-summary-value">{selectedTags.length?`${selectedTags.length} selected`:'None'}</span></summary><div className="tag-options" role="group" aria-label="Purchase tags">{tags.map(tag=><button key={tag.id} type="button" aria-pressed={selectedTags.includes(tag.id)} onClick={()=>setTags(current=>current.includes(tag.id)?current.filter(id=>id!==tag.id):[...current,tag.id])}>{tag.name}</button>)}</div></details>
   <label className="workflow-field">Whose expense?<select value={attribution} onChange={event=>setAttribution(event.target.value)}><option value="personal">Personal</option><option value="shared">Shared</option><option value="reimbursable">Reimbursable</option></select></label>
   {attribution!=='personal' && <label className="workflow-field">Your personal share (PHP)<input inputMode="decimal" value={share} onChange={event=>setShare(event.target.value)} required/></label>}
   {possible && <label className="sms-check"><input type="checkbox" required checked={distinct} onChange={event=>setDistinct(event.target.checked)}/>I checked: this is a separate purchase.</label>}
   <label className="sms-check"><input type="checkbox" required checked={checked} onChange={event=>setChecked(event.target.checked)}/>I checked the date, category and personal share.</label>
   {error && <p role="alert" className="notice">{error}</p>}
   <div className="sms-actions"><button type="button" className="text-button" disabled={disabled||busy} onClick={()=>act('dismiss')}>Dismiss</button><button className="solid-button" disabled={disabled||busy||!checked||!category}>{busy?'Working…':'Record expense'}</button></div>
  </form>
 </details>;
}
