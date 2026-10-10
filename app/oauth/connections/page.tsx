import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { remoteConfig } from '@/lib/mcp/remote/config';

export const dynamic = 'force-dynamic';
async function session() {
  // Keep revocation available even while the MCP endpoint is disabled.
  const db=await createClient();
  const {data,error}=await db.auth.getUser();
  if(error || !data.user) redirect('/login');
  return db;
}
async function revoke(form:FormData) {
  'use server';
  const clientId=z.uuid().parse(form.get('client_id'));
  if(!remoteConfig().clientIds.includes(clientId)) throw new Error('Connection unavailable');
  const db=await session();
  const {error}=await db.auth.oauth.revokeGrant({ clientId });
  if(error) throw new Error('Revocation could not be confirmed. Try again.');
  revalidatePath('/oauth/connections');
}
export default async function ConnectionsPage() {
  const db=await session();
  const {data,error}=await db.auth.oauth.listGrants();
  if(error) return <main className="p-8">Connections are unavailable. Please try again.</main>;
  const grants=data.filter(grant=>remoteConfig().clientIds.includes(grant.client.id));
  return <main className="mx-auto max-w-lg space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Expense logging connections</h1>
    <p>Revoking a connection stops its tools, including retries with existing access tokens.</p>
    {grants.length===0 && <p>No active expense logging connections.</p>}
    {grants.map(grant=><form key={grant.client.id} action={revoke} className="flex items-center justify-between gap-4">
      <span>{grant.client.name}</span><input type="hidden" name="client_id" value={grant.client.id}/>
      <button className="rounded border px-4 py-2">Revoke access</button>
    </form>)}
  </main>;
}
