import { probeProvider } from '../lib/mcp/remote/provider';

async function main() {
  try {
    const result = await probeProvider(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    console.log(JSON.stringify(result,null,2));
  } catch {
    // No exception dump: upstream bodies, request headers and keys are not logs.
    console.error('OAuth discovery/JWKS could not be verified. Keep remote MCP disabled. Check the configured HTTPS Supabase URL, network access, OAuth enablement and asymmetric signing keys.');
    process.exitCode = 1;
  }
}
void main();
