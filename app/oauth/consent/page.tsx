import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { remoteConfig } from '@/lib/mcp/remote/config';
import { validConfig } from '@/lib/mcp/remote/auth';
import { consentPath, oauthCallback } from '@/lib/mcp/remote/consent';

export const dynamic = 'force-dynamic';

async function authorization(id: string) {
  const config = remoteConfig();
  if (!config.enabled || !validConfig(config) || !process.env.FINANCE_MCP_REDIRECT_URI) notFound();
  z.uuid().parse(id);
  const db = await createClient();
  const { data: user, error: userError } = await db.auth.getUser();
  if (userError || !user.user) redirect(`/login?next=${encodeURIComponent(consentPath(id))}`);
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data || !config.clientIds.includes(data.client?.id) || data.user?.id !== user.user.id)
    throw new Error('This OAuth request is unavailable or its client is not approved.');
  return { db, data };
}

async function decide(form: FormData) {
  'use server';
  const id = z.uuid().parse(form.get('authorization_id'));
  const decision = z.enum(['approve', 'deny']).parse(form.get('decision'));
  const { db } = await authorization(id); // Recheck session and client at action time.
  const { data, error } = decision === 'approve'
    ? await db.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await db.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) throw new Error('Authorization could not be completed.');
  redirect(oauthCallback(data.redirect_url, process.env.FINANCE_MCP_REDIRECT_URI!));
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const parsed = z.uuid().safeParse((await searchParams).authorization_id);
  if (!parsed.success) return <main className="p-8">Missing or invalid authorization request.</main>;
  const { data } = await authorization(parsed.data);
  if (data.redirect_url) redirect(oauthCallback(data.redirect_url, process.env.FINANCE_MCP_REDIRECT_URI!));
  return <main className="mx-auto max-w-lg space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Connect Finance Tracker</h1>
    <p>{data.client.name} is asking to connect as {data.user.email}.</p>
    <p>This connection can read your account names, expense categories and tags, preview personal PHP expenses, check matching purchases for duplicates, and save expenses you ask it to log.</p>
    <p>Every expense needs an account you explicitly select. The connection cannot read balances, browse your ledger, transfer money, edit or delete transactions, or manage credentials.</p>
    <p>Identity information requested by the OAuth client: {data.scope || 'none'}.</p>
    <p>You can revoke this connection in <Link href="/oauth/connections" className="underline">expense logging connections</Link>. The integration also expires at its configured expiry.</p>
    <form action={decide} className="flex gap-4">
      <input type="hidden" name="authorization_id" value={parsed.data} />
      <button name="decision" value="deny" className="rounded border px-4 py-2">Deny</button>
      <button name="decision" value="approve" className="rounded bg-primary px-4 py-2 text-primary-foreground">Allow expense logging</button>
    </form>
    <Link href="/dashboard">Return to Finance Tracker</Link>
  </main>;
}
