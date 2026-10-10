import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { handleReflection, matchesReflectionKey } from '@/lib/finance/reflections';
import { reflectionStore } from '@/lib/finance/reflection-store';
import { json } from '@/lib/finance/sms/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function run(request: Request, context: { params: Promise<{ month: string }> }) {
  const { month } = await context.params;
  return handleReflection(request, month, async () => {
    const authorization = request.headers.get('authorization');
    if (authorization !== null) {
      const key = process.env.FINANCE_DOT_REFLECTION_KEY;
      if (!key) return json({ error: 'Reflection access is not configured' }, 503);
      if (!matchesReflectionKey(authorization, key)) return json({ error: 'unauthorized' }, 401);
      const owner = z.uuid().safeParse(process.env.FINANCE_DOT_REFLECTION_OWNER_ID);
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!owner.success || !serviceKey || !url) return json({ error: 'Reflection access is not configured' }, 503);
      return reflectionStore(createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }), owner.data);
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return json({ error: 'Database not configured' }, 503);
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    return user ? reflectionStore(db, user.id) : json({ error: 'unauthorized' }, 401);
  });
}
export const GET = run;
export const PUT = run;
