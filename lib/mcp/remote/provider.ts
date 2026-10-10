import { z } from 'zod';

const providerMetadata = z.object({
  issuer: z.string(), authorization_endpoint: z.url(), token_endpoint: z.url(),
  response_types_supported: z.array(z.string()), grant_types_supported: z.array(z.string()),
  code_challenge_methods_supported: z.array(z.string()), token_endpoint_auth_methods_supported: z.array(z.string()),
  scopes_supported: z.array(z.string()),
  authorization_response_iss_parameter_supported: z.boolean().optional(),
});
export function checkProviderMetadata(raw: unknown, issuer: string) {
  const metadata = providerMetadata.parse(raw);
  const origin = new URL(issuer).origin;
  if (metadata.issuer !== issuer || !metadata.code_challenge_methods_supported.includes('S256') ||
    !metadata.response_types_supported.includes('code') || !metadata.grant_types_supported.includes('authorization_code') ||
    !metadata.grant_types_supported.includes('refresh_token') || !metadata.scopes_supported.includes('openid') ||
    !metadata.token_endpoint_auth_methods_supported.some(method => ['none','client_secret_basic','client_secret_post'].includes(method)) ||
    [metadata.authorization_endpoint,metadata.token_endpoint].some(endpoint => {
      const url = new URL(endpoint);
      return url.protocol !== 'https:' || url.origin !== origin || !!url.username || !!url.password || !!url.hash;
    })) throw new Error('Provider does not advertise the required pinned OAuth/PKCE flow');
  return metadata;
}

/** Read-only, no API key, token, client registration, authorization or consent. */
export async function probeProvider(supabaseUrl: string, fetcher: typeof fetch = fetch) {
  const url = new URL(supabaseUrl);
  if (url.protocol !== 'https:' || url.origin !== supabaseUrl) throw new Error('Use an exact HTTPS Supabase origin');
  const issuer = `${supabaseUrl}/auth/v1`;
  const read = async (path: string) => {
    const response = await fetcher(`${supabaseUrl}${path}`, { redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Provider discovery returned HTTP ${response.status}`);
    return response.json();
  };
  const [raw, keys] = await Promise.all([
    read('/.well-known/oauth-authorization-server/auth/v1'), read('/auth/v1/.well-known/jwks.json'),
  ]);
  const metadata = checkProviderMetadata(raw,issuer);
  const jwks = z.object({ keys: z.array(z.object({ kty:z.string(), alg:z.string().optional(), use:z.string().optional(), d:z.unknown().optional() })) }).parse(keys);
  if (!jwks.keys.some(key => ['RSA','EC'].includes(key.kty) && (key.alg === 'RS256' || key.alg === 'ES256') && key.d === undefined && (!key.use || key.use === 'sig')))
    throw new Error('Provider must publish an asymmetric RS256 or ES256 signing key');
  return { issuer, authorization_endpoint:metadata.authorization_endpoint, token_endpoint:metadata.token_endpoint,
    pkce:'S256', identity_scopes:metadata.scopes_supported, token_endpoint_auth_methods:metadata.token_endpoint_auth_methods_supported,
    issuer_callback_supported:metadata.authorization_response_iss_parameter_supported === true,
    signing_algorithms:[...new Set(jwks.keys.map(key=>key.alg).filter(Boolean))],
    staging_proof_required:['resource parameter handling on authorization AND token exchange', 'signed client-pinned resource and finance_mcp role on issuance AND refresh', 'PostgREST permission denial and immediate consent/session/integration revocation', 'actual tool availability in the user’s dot'],
  };
}
