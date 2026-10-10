import type { RemoteConfig } from './auth';

// This review deployment is authorized only with MCP access disabled. A future
// activation needs a separately approved code change as well as the SQL/Auth
// setup; inherited hosting environment values cannot unlock this deployment.
const activationApproved = false;

export function remoteConfig(): RemoteConfig {
  return {
    enabled: activationApproved && process.env.FINANCE_MCP_REMOTE_ENABLED === 'true',
    resource: process.env.FINANCE_MCP_RESOURCE ?? '',
    issuer: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/auth/v1`,
    clientIds: activationApproved
      ? (process.env.FINANCE_MCP_CLIENT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
      : [],
  };
}
