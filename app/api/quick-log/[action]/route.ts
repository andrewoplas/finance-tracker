import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { json,readJson,InputError } from '@/lib/finance/sms/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{action:string}>};
const unavailable=()=>json({error:'Quick log is not activated or is temporarily unavailable.'},503);
export async function GET(_request:Request,context:Context){
 if((await context.params).action!=='workspace')return json({error:'Unknown action'},404);
 try{
  const db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)return json({error:'Unauthorized'},401);
  const [keys,inbox,accounts]=await Promise.all([
   db.rpc('manage_quick_log_credential',{p_action:'list'}),
   db.from('quick_log_inbox').select('id,entry,revision',{count:'exact'}).eq('user_id',user.id).eq('state','needs_review').order('created_at').limit(50),
   db.from('accounts').select('id,name').eq('user_id',user.id).eq('is_archived',false),
  ]);
  if([keys,inbox,accounts].some(v=>v.error))return unavailable();
  return json({keys:keys.data,inbox:inbox.data,total:inbox.count,accounts:accounts.data});
 }catch{return unavailable();}
}
export async function POST(request:Request,context:Context){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin rejected'},403);
 try{
  const db=await createClient();const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)return json({error:'Unauthorized'},401);
  const body=await readJson(request),{action}=await context.params;
  if(action==='create-key'){
   const parsed=z.object({label:z.string().trim().min(1).max(60),acknowledged:z.literal(true)}).strict().safeParse(body);
   if(!parsed.success)return json({error:'Approve expense-write access before creating a key'},400);
   const token=`ft_quick_${randomBytes(32).toString('hex')}`;
   const {data,error}=await db.rpc('manage_quick_log_credential',{p_action:'create',p_values:{label:parsed.data.label,token_hash:createHash('sha256').update(token).digest('hex')}});
   return error?json({error:'Could not create key; check activation and unused keys'},422):json({...data,token},201);
  }
  if(action==='revoke-key'){
   const parsed=z.object({id:z.uuid()}).strict().safeParse(body);if(!parsed.success)return json({error:'Invalid key'},400);
   const {data,error}=await db.rpc('manage_quick_log_credential',{p_action:'revoke',p_values:parsed.data});
   return error?json({error:'Could not revoke key'},422):json(data);
  }
  if(action==='review'){
   const parsed=z.object({id:z.uuid(),revision:z.number().int().positive(),action:z.enum(['record','dismiss']),confirm_distinct:z.boolean()}).strict().safeParse(body);
   if(!parsed.success)return json({error:'Invalid review'},400);
   const v=parsed.data;const {data,error}=await db.rpc('review_quick_log',{p_id:v.id,p_revision:v.revision,p_action:v.action,p_confirm_distinct:v.confirm_distinct});
   return error?json({error:'Review rejected; reload and confirm this is a separate expense'},error.code==='40001'?409:422):json(data);
  }
  return json({error:'Unknown action'},404);
 }catch(error){return error instanceof InputError?json({error:error.message},error.status):unavailable();}
}
