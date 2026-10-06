import { financeMcp } from '@/lib/mcp/finance-server';
import { createClient } from '@/lib/supabase/server';
import { GET as readFinance, POST as writeFinance } from '../finance/[action]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const endpoint = financeMcp({
  enabled: process.env.FINANCE_MCP_LOCAL_ENABLED === 'true',
  origin: process.env.FINANCE_MCP_LOCAL_ORIGIN ?? '',
  authenticate: async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      throw new Error('Authentication unavailable');
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error) return false;
    return !!data.user;
  },
  dispatch: (request, action) => (request.method === 'GET' ? readFinance : writeFinance)(request, {
    params: Promise.resolve({ action }),
  }),
});
export const POST = endpoint.fetch;
export const GET = endpoint.fetch;
export const DELETE = endpoint.fetch;
