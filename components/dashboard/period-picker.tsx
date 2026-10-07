'use client'
import {useRef,useState} from 'react'
import {useRouter,usePathname,useSearchParams} from 'next/navigation'
import {Check,X} from 'lucide-react'
import {Drawer,DrawerContent,DrawerHeader,DrawerTitle,DrawerDescription,DrawerTrigger,DrawerClose} from '@/components/ui/drawer'
export function PeriodPicker({month}:{month:string}){
 const [year,setYear]=useState(Number(month.slice(0,4)));
 const launched=useRef(false);
 const router=useRouter(),path=usePathname(),search=useSearchParams();
 const open=search.get('period')==='1';
 function setOpen(value:boolean){const params=new URLSearchParams(search.toString());if(value){launched.current=true;params.set('period','1');window.history.pushState(null, "", `${path}?${params}`);}else if(launched.current){launched.current=false;router.back();}else{params.delete('period');window.history.replaceState(null, "", `${path}?${params}`);}}
 const label=new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
 return <Drawer open={open} onOpenChange={v=>{setOpen(v);if(v)setYear(Number(month.slice(0,4)));}} shouldScaleBackground={false}><DrawerTrigger asChild><button className="period-chip" aria-label={`Choose period, ${label}`}>{label}</button></DrawerTrigger><DrawerContent className="period-sheet"><DrawerHeader><div className="entry-sheet-heading"><DrawerTitle>Choose month</DrawerTitle><DrawerClose aria-label="Close period picker"><X size={20}/></DrawerClose></div><DrawerDescription>Updates the overview, transactions, and spending plan.</DrawerDescription></DrawerHeader><div className="period-content"><label className="workflow-field">Year<input aria-label="Year" type="number" min="1900" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><div className="month-grid">{Array.from({length:12},(_,i)=>{const value=`${year}-${String(i+1).padStart(2,'0')}`;return <button disabled={year<1900||year>2100} key={i} aria-pressed={value===month} onClick={()=>{const params=new URLSearchParams(search.toString());params.set('month',value);params.delete('period');launched.current=false;router.replace(`${path}?${params}`,{scroll:false});}}>{new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))}{value===month&&<Check size={16}/>}</button>})}</div></div></DrawerContent></Drawer>
}
