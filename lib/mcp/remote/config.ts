import type { RemoteConfig } from './auth';
export function remoteConfig(): RemoteConfig {
  return {
    enabled: process.env.FINANCE_MCP_REMOTE_ENABLED === 'true',
    resource: process.env.FINANCE_MCP_RESOURCE ?? '',
    issuer: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/auth/v1`,
    // Empty is safe for discovery/bootstrap: no token can pass the allowlist.
    clientIds: (process.env.FINANCE_MCP_CLIENT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
