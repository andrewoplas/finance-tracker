import { createClient } from '@supabase/supabase-js';
import { remoteConfig } from '@/lib/mcp/remote/config';
import { tokenVerifier } from '@/lib/mcp/remote/auth';
import { remoteExpenseMcp } from '@/lib/mcp/remote/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const config = remoteConfig();
// Construct the verifier lazily: disabled deployments need no OAuth settings.
let verify: ReturnType<typeof tokenVerifier> | undefined;
const endpoint = remoteExpenseMcp({ config,
  authenticate: token => (verify ??= tokenVerifier(config))(token),
  rpc: principal => {
    // Only the same issuer's Supabase Data API receives its user token. Never
    // use a service-role key, browser cookies, refresh token, or arbitrary URL.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      accessToken: async () => principal.token,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return async (action, args) => {
      const { data, error } = await db.rpc('remote_expense', { p_action: action, p_args: args });
      if (error) throw new Error('Expense service unavailable');
      return data;
    };
  },
});
export const POST = endpoint;
export const GET = endpoint;
export const DELETE = endpoint;
