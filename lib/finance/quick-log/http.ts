import { z } from 'zod';
import { dateOnly, entrySchema } from '../core';
import { json, readJson, InputError } from '../sms/http';
export const quickInput = z.object({
  text: z.string().trim().min(1).max(1000),
  action: z.enum(['preview','commit']),
  date: dateOnly.optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(v => v.action !== 'commit' || (!!v.date && !!v.digest));
export type QuickRpc = (args:{p_token:string;p_request_id:string;p_text:string;p_action:string;p_date:string|null;p_digest:string|null}) => Promise<{data:unknown;error:unknown}>;
const preview = z.object({request_id:z.uuid(),entry:entrySchema,summary:z.object({account:z.string(),category:z.string().nullable(),tags:z.array(z.string())}).strict(),date:dateOnly,digest:z.string().regex(/^[a-f0-9]{64}$/),persisted:z.literal(false)}).strict();
const receipt = z.object({id:z.uuid(),status:z.enum(['recorded','needs_review']),transaction_id:z.uuid().optional(),persisted:z.boolean(),duplicate:z.boolean()}).strict()
  .refine(v=>v.status==='recorded' ? v.persisted && !!v.transaction_id : !v.persisted && !v.transaction_id);
const errors = ['unauthorized','invalid_input','idempotency_conflict','rate_limited','preview_required','inbox_full',
 'use_exp_description_amount_account','unsupported_event','account_required','account_ambiguous','amount_ambiguous','invalid_amount',
 'date_ambiguous','invalid_date','use_exact_amount_and_full_date','tag_ambiguous','tag_unavailable_or_ambiguous','category_ambiguous',
 'category_unavailable_or_ambiguous','amount_required','description_required'];
export async function handleQuickLog(request:Request,submit:QuickRpc) {
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)return json({error:'origin_rejected'},403);
 const token=request.headers.get('authorization')?.match(/^Bearer (ft_quick_[a-f0-9]{64})$/)?.[1];
 if(!token)return json({error:'unauthorized'},401);
 const id=z.uuid().safeParse(request.headers.get('idempotency-key'));
 if(!id.success)return json({error:'Idempotency-Key must be a UUID'},400);
 try {
  const input=quickInput.safeParse(await readJson(request));
  if(!input.success)return json({error:'Provide text and action; commit requires the preview date and digest'},400);
  const v=input.data;
  const result=await submit({p_token:token,p_request_id:id.data,p_text:v.text,p_action:v.action,p_date:v.date??null,p_digest:v.digest??null});
  if(result.error)return json({error:'Quick log unavailable'},503);
  if(result.data && typeof result.data==='object' && 'error' in result.data){
   const code=String(result.data.error);if(!errors.includes(code))return json({error:'Quick log unavailable'},503);
   const status=code==='unauthorized'?401:code==='rate_limited'?429:['idempotency_conflict','preview_required','inbox_full'].includes(code)?409:422;
   const response=json({error:code},status);if(status===429)response.headers.set('Retry-After','60');return response;
  }
  const parsed=(v.action==='preview'?preview:receipt).safeParse(result.data);
  if(!parsed.success)return json({error:'Quick log unavailable'},503);
  return json(parsed.data,v.action==='preview'||('duplicate' in parsed.data && parsed.data.duplicate)?200:201);
 }catch(error){return error instanceof InputError?json({error:error.message},error.status):json({error:'Quick log unavailable'},503);}
}
