'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
export function TagManager({ tags, available }: { tags: {id:string;name:string}[]; available:boolean }) {
 const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const router=useRouter();
 async function add(event:React.FormEvent) {
  event.preventDefault();setBusy(true);setError('');
  try { const db=createClient();const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Sign in to add a tag.');
   const {error}=await db.from('tags').insert({user_id:user.id,name:name.trim()});if(error)throw Error(error.code==='23505'?'That tag already exists.':'Could not save the tag.');
   setName('');router.refresh();
  } catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}
 }
 return <section className="surface"><h2>Tags</h2><p className="muted">A transaction can have several tags. Tags do not change its category or amount.</p>{!available?<p role="status">Tags could not load. Please try again shortly.</p>:<><div className="transaction-tags">{tags.map(tag=><span key={tag.id}>#{tag.name}</span>)}</div><form onSubmit={add} className="workflow-form"><label className="workflow-field">New tag<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} required /></label><button className="solid-button" disabled={busy||!name.trim()}>{busy?'Saving…':'Add tag'}</button></form></>}{error&&<p role="alert">{error}</p>}</section>;
}
