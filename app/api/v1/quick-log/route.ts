import { createClient } from '@supabase/supabase-js';
import { handleQuickLog } from '@/lib/finance/quick-log/http';
import { json } from '@/lib/finance/sms/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return json({error:'Quick log unavailable'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return handleQuickLog(request,async args=>{const {data,error}=await db.rpc('submit_quick_log',args);return {data,error};});
}
