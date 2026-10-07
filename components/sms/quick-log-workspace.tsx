'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import type {Entry} from '@/lib/finance/core';
type Choice={id:string;name:string};
type Key={id:string;label:string;expires_at:string;revoked_at:string|null};
type Receipt={id:string;revision:number;entry:Entry};
type Workspace={keys:Key[];inbox:Receipt[];total:number;accounts:Choice[]};
async function send(action:string,body:unknown){const response=await fetch(`/api/quick-log/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||'Please try again.');return result;}
export function QuickLogWorkspace({setup=false,demo=false}:{setup?:boolean;demo?:boolean}){
 const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{try{const response=await fetch('/api/quick-log/workspace',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error);setData(result);setError('');}catch(error){setError(error instanceof Error?error.message:'Quick log unavailable.');}},[]);
 useEffect(()=>{if(demo){setData({keys:[],accounts:[{id:'20000000-0000-4000-8000-000000000001',name:'Cash'}],total:1,inbox:[{id:'50000000-0000-4000-8000-000000000002',revision:1,entry:{account_id:'20000000-0000-4000-8000-000000000001',description:'Synthetic badminton',amount:'210.00',date:'2026-10-07',report_month:'2026-10',type:'expense',category_id:null,wallet_id:null,to_account_id:null,bill_date:null,paid_date:null,attribution:'personal',personal_amount:'210.00',review_status:'reviewed'}}]});return;}void load();},[load,demo]);
 return <section className="sms-workspace"><h2>{setup?'Assistant quick log':'Quick-log review'}</h2>
  <p className="muted">{setup?'Log shorthand such as exp badminton food 210 cash. Each entry needs an account; dates use today in Manila unless a full date is supplied.':'Possible repeated expenses stay here until you confirm they are separate. They do not count as spending.'}</p>
  {error&&<div role="alert" className="notice">{error}<button type="button" className="text-button" onClick={load}>Retry</button></div>}
  {message&&<p role="status" className="notice">{message}</p>}
  {!data&&!error&&<p role="status">Loading…</p>}
  {data&&(setup?<QuickKeySetup keys={data.keys} onChanged={load} disabled={demo}/>:<>
   <p className="muted">{data.total?`${data.total} awaiting review${data.total>50?' · Showing the oldest 50':''}`:'No quick-log duplicates awaiting review.'}</p>
   {data.inbox.map(receipt=><QuickReview key={receipt.id} receipt={receipt} disabled={demo} account={data.accounts.find(a=>a.id===receipt.entry.account_id)?.name??'Account'} onDone={async result=>{setMessage(result);await load();}}/>)}
  </>)}
 </section>;
}
function QuickKeySetup({keys,onChanged,disabled=false}:{keys:Key[];onChanged:()=>Promise<void>;disabled?:boolean}){
 const [label,setLabel]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[token,setToken]=useState(''),[copied,setCopied]=useState(false);
 async function create(event:React.FormEvent){event.preventDefault();if(disabled)return;setBusy(true);setError('');setToken('');setCopied(false);try{const result=await send('create-key',{label,acknowledged:approved});setToken(result.token);setApproved(false);await onChanged();}catch(error){setError(error instanceof Error?error.message:'Could not create key.');}finally{setBusy(false);}}
 async function revoke(id:string){if(disabled)return;setBusy(true);setError('');try{await send('revoke-key',{id});setToken('');await onChanged();}catch(error){setError(error instanceof Error?error.message:'Could not revoke key.');}finally{setBusy(false);}}
 return <>
  {keys.length>0&&<ul className="sms-keys">{keys.map(key=><li key={key.id}><div><strong>{key.label}</strong><span className="muted">{key.revoked_at?'Revoked':`Expense write · expires ${key.expires_at.slice(0,10)}`}</span></div>{!key.revoked_at&&<button type="button" className="text-button" disabled={busy} onClick={()=>revoke(key.id)}>Revoke</button>}</li>)}</ul>}
  <details className="inspector-section"><summary><span>Create a quick-log key</span></summary><form className="workflow-form sms-key-form" onSubmit={create}>
   <p className="muted">This separate key can preview and record personal expenses into your owned accounts. It cannot read transaction history, transfer money, edit or undo entries. It expires after 90 days. Review and undo saved expenses in Transactions.</p>
   <label className="workflow-field">Key label<input required maxLength={60} value={label} onChange={event=>setLabel(event.target.value)} placeholder="Personal assistant"/></label>
   <label className="sms-check"><input type="checkbox" required checked={approved} onChange={event=>setApproved(event.target.checked)}/>I approve expense-write access for this quick-log client.</label>
   <button className="solid-button" disabled={disabled||busy||!approved}>{busy?'Working…':'Create quick-log key'}</button>
  </form></details>
  {token&&<div className="notice"><p>Save this key now. It is shown only once. Keep it in your client’s private key file.</p><input aria-label="New quick-log API key" className="sms-secret" type="password" readOnly value={token} autoComplete="off"/><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(token);setCopied(true);}catch{setError('Select and copy the key manually.');}}}>{copied?'Copied':'Copy key'}</button><button type="button" className="text-button" onClick={()=>setToken('')}>I saved it</button></div>}
  {error&&<p role="alert" className="notice">{error}</p>}
  <details className="inspector-section"><summary><span>Quick-log setup</span></summary><div className="inspector-section-content"><p className="muted">Use the finance-quick-log skill’s executable client or POST to <code>/api/v1/quick-log</code>. Preview first, then commit the same text, UUID, date and digest. A key alone does not connect a chat.</p><p className="muted">Use an exact account name at the end, or RCBC if exactly one owned account starts with that name. Food selects your existing Food tag. Other tags use <code>#Tag</code>; a category is selected only with <code>category:Name</code>. These compact tag/category names cannot contain spaces. Unknown or ambiguous fields require clarification.</p><p className="muted">Limits: 1,000 bytes of text, 20 calls per minute and 200 per day per key. Possible duplicates go to the <Link href="/dashboard/inbox">review inbox</Link>.</p></div></details>
 </>;
}
function QuickReview({receipt,account,onDone,disabled=false}:{receipt:Receipt;account:string;onDone:(message:string)=>Promise<void>;disabled?:boolean}){
 const [distinct,setDistinct]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(action:'record'|'dismiss'){if(disabled)return;setBusy(true);setError('');try{const result=await send('review',{id:receipt.id,revision:receipt.revision,action,confirm_distinct:distinct});await onDone(result.status==='recorded'?`Recorded expense. Receipt ${result.transaction_id}`:'Dismissed duplicate.');}catch(error){setError(error instanceof Error?error.message:'Could not review.');}finally{setBusy(false);}}
 const e=receipt.entry;
 return <details className="sms-receipt"><summary><span><strong>{e.description}</strong><small>{account} · {e.date}</small></span><b>PHP {e.amount}</b></summary><form className="workflow-form" onSubmit={event=>{event.preventDefault();void act('record');}}>
  <p className="muted">Personal expense · report month {e.report_month}. The original tags and category will be preserved.</p>
  <label className="sms-check"><input type="checkbox" required checked={distinct} onChange={event=>setDistinct(event.target.checked)}/>I checked the ledger: this is a separate expense.</label>
  {error&&<p role="alert" className="notice">{error}</p>}
  <div className="sms-actions"><button type="button" className="text-button" disabled={disabled||busy} onClick={()=>act('dismiss')}>Dismiss</button><button className="solid-button" disabled={disabled||busy||!distinct}>{busy?'Working…':'Record separate expense'}</button></div>
 </form></details>;
}
