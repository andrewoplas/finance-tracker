'use client'
import { MonthlyLink as Link } from "@/components/dashboard/monthly-link";
import {usePathname,useSearchParams,useRouter} from 'next/navigation'
import {useEffect,useRef,useState} from 'react'
import {Home,ArrowLeftRight,CalendarDays,Plus,X} from 'lucide-react'
import {Drawer,DrawerContent,DrawerHeader,DrawerTitle,DrawerDescription} from '@/components/ui/drawer'
import {TransactionInspector} from '@/components/transactions/transaction-inspector'
import {entrySchema,manilaToday,type LedgerEntry} from '@/lib/finance/core'
import {demoCategories} from '@/lib/finance/demo'
import {toast} from 'sonner'

type Context={tags?:{id:string;name:string}[];tagsAvailable?:boolean;accounts:{id:string;name:string}[];categories:{id:string;name:string}[]}
export function BottomNavigation({demo=false}:{demo?:boolean}){
 const pathname=usePathname(),search=useSearchParams(),router=useRouter();
 const base=demo?'/demo':'/dashboard',open=search.get('entry')==='1';
 const launched=useRef(false),trigger=useRef<HTMLButtonElement>(null);
 const [liveContext,setContext]=useState<Context|null>(null),[error,setError]=useState('');
 const context=demo?{accounts:[{id:'10000000-0000-4000-8000-000000000001',name:'Everyday account'}],categories:demoCategories}:liveContext;
 const month=search.get('month'),suffix=month?`month=${month}&`:'';
 const tabs=[{name:'Overview',href:`${base}?${suffix}view=overview`,icon:Home,active:pathname===base&&(!search.get('view')||search.get('view')==='overview')},{name:'Transactions',href:`${base}?${suffix}view=transactions`,icon:ArrowLeftRight,active:pathname===base&&search.get('view')==='transactions'},{name:'Plans',href:`${base}?${suffix}view=analysis`,icon:CalendarDays,active:pathname===base&&search.get('view')==='analysis'}];
 useEffect(()=>{
  if(!open)return;
  let active=true;
  if(demo)return;
  fetch('/api/finance/context',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load accounts');if(active)setContext(data);}).catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[open,demo]);
 function close(){if(launched.current){launched.current=false;router.back();}else{const params=new URLSearchParams(search.toString());params.delete('entry');router.replace(`${pathname}?${params}`,{scroll:false});}requestAnimationFrame(()=>trigger.current?.focus());}
 const date=demo?`${month||'2026-10'}-22`:manilaToday();
 const draft:LedgerEntry|undefined=context?.accounts.length?{...entrySchema.parse({account_id:context.accounts[0].id,type:'expense',amount:'1',description:'New transaction',date,report_month:date.slice(0,7)}),id:'00000000-0000-4000-8000-000000000001',revision:1,amount:'',description:''}:undefined;
 return <><nav className="mobile-tabbar" aria-label="Main tabs">{tabs.map(t=><Link key={t.name} href={t.href} aria-current={t.active?'page':undefined}><t.icon size={21}/><span>{t.name}</span></Link>)}<button ref={trigger} className="mobile-add" aria-label="Add transaction" onClick={()=>{setContext(null);setError('');launched.current=true;const params=new URLSearchParams(search.toString());params.set('entry','1');router.push(`${pathname}?${params}`,{scroll:false});}}><Plus size={23}/></button></nav>
 <Drawer open={open} onOpenChange={value=>{if(!value)close();}} shouldScaleBackground={false}>
 <DrawerContent className="mobile-entry-sheet" onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}}><DrawerHeader><div className="entry-sheet-heading"><DrawerTitle>Add transaction</DrawerTitle><button aria-label="Close entry" onClick={close}><X size={21}/></button></div><DrawerDescription>{demo?'Synthetic preview · Nothing is sent or persisted.':'A manual fallback for when you need it.'}</DrawerDescription></DrawerHeader><div className="entry-sheet-scroll">{error?<p role="alert">{error}</p>:!context?<p role="status">Loading accounts…</p>:!draft?<p>Add an account first in <Link href="/dashboard/accounts" onClick={()=>{launched.current=false;}}>Accounts</Link>.</p>:<TransactionInspector key={date} entry={draft} accounts={context.accounts} categories={context.categories} tags={context.tags} tagsAvailable={context.tagsAvailable} demo={demo} creating onSaved={entry=>{if(demo&&entry)window.dispatchEvent(new CustomEvent('finance-demo-entry',{detail:{...entry,id:crypto.randomUUID()}}));toast.success(demo?'Transaction saved in this demo view only':'Transaction saved');close();if(!demo)router.refresh();}}/>}<button className="entry-cancel" onClick={close}>Cancel</button></div></DrawerContent></Drawer></>
}
