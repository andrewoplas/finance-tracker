import { createClient } from '@supabase/supabase-js';
import { handleCardSms, json } from '@/lib/finance/sms/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return json({error:'SMS ingestion unavailable'},503);
  // Intentionally anonymous: the one RPC authenticates the inbox-only opaque token.
  // No service-role key, user-session forwarding, AI call, or financial payload logging.
  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return handleCardSms(request,async args => {
    const {data,error} = await db.rpc('submit_card_sms',args);
    return {data,error};
  });
}
