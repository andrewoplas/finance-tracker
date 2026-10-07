import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { credentialInput, reviewInput, readJson, json, InputError } from '@/lib/finance/sms/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params:Promise<{action:string}>};
const unavailable = () => json({error:'SMS inbox is not activated or is temporarily unavailable.'},503);
export async function GET(_request: Request, context: Context) {
  const {action} = await context.params;
  if (action !== 'workspace') return json({error:'Unknown action'},404);
  try {
    const db = await createClient();
    const {data:{user},error:authError} = await db.auth.getUser();
    if (authError || !user) return json({error:'Unauthorized'},401);
    const [keys,inbox,accounts,categories,tags] = await Promise.all([
      db.rpc('manage_card_sms_credential',{p_action:'list'}),
      db.from('card_sms_inbox').select('id,account_id,last4,merchant,amount,received_at,sms_date_label,transaction_date,date_issue,possible_duplicate,state,revision',{count:'exact'}).eq('user_id',user.id).eq('state','needs_review').order('created_at',{ascending:true}).limit(50),
      db.from('accounts').select('id,name').eq('user_id',user.id).eq('type','credit-card').eq('is_archived',false),
      db.from('categories').select('id,name').eq('user_id',user.id).eq('type','expense').order('name'),
      db.from('tags').select('id,name').eq('user_id',user.id).order('name').limit(501),
    ]);
    if ([keys,inbox,accounts,categories,tags].some(result=>result.error) || (tags.data?.length ?? 0)>500) return unavailable();
    return json({keys:keys.data,inbox:inbox.data,total:inbox.count,accounts:accounts.data,categories:categories.data,tags:tags.data});
  } catch { return unavailable(); }
}
export async function POST(request: Request, context: Context) {
  // Session management and review are same-origin browser actions only.
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'Origin rejected'},403);
  try {
    const db = await createClient();
    const {data:{user},error:authError} = await db.auth.getUser();
    if (authError || !user) return json({error:'Unauthorized'},401);
    const {action} = await context.params;
    const body = await readJson(request,8192);
    if (action === 'create-key') {
      const parsed = credentialInput.safeParse(body);
      if (!parsed.success) return json({error:'Confirm the card mapping and inbox-only access before creating a key.'},400);
      const token = `ft_sms_${randomBytes(32).toString('hex')}`;
      const {acknowledged,...settings} = parsed.data; void acknowledged;
      const {data,error} = await db.rpc('manage_card_sms_credential',{p_action:'create',p_values:{...settings,token_hash:createHash('sha256').update(token).digest('hex')}});
      if (error) return json({error:error.code==='P0001' ? error.message : 'Could not create the key. Check that SMS ingestion is activated.'},422);
      // Show once; the plaintext key is not stored in the app, database, or logs.
      return json({...data,token},201);
    }
    if (action === 'revoke-key') {
      const parsed = z.object({id:z.uuid()}).strict().safeParse(body);
      if (!parsed.success) return json({error:'Invalid key'},400);
      const {data,error} = await db.rpc('manage_card_sms_credential',{p_action:'revoke',p_values:parsed.data});
      return error ? json({error:'Could not revoke the key'},422) : json(data);
    }
    if (action === 'review') {
      const parsed = reviewInput.safeParse(body);
      if (!parsed.success) return json({error:'Check the review fields'},400);
      const value = parsed.data;
      const {data,error} = await db.rpc('review_card_sms',{p_id:value.id,p_revision:value.revision,p_action:value.action,p_values:value.values ?? {}});
      if (error) return json({error:['P0001','40001'].includes(error.code) ? error.message : 'Review rejected. Check the date, category, tags and personal share.'},error.code==='40001' ? 409 : 422);
      return json(data);
    }
    return json({error:'Unknown action'},404);
  } catch(error) { return error instanceof InputError ? json({error:error.message},error.status) : unavailable(); }
}
