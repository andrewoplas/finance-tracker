import { createRemoteJWKSet, jwtVerify, errors, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

export type RemoteConfig = { enabled: boolean; resource: string; issuer: string; clientIds: string[] };
export type Principal = { owner: string; clientId: string; sessionId: string; token: string };
export const permissions = ['expense:read', 'expense:write'] as const;
export class AuthenticationUnavailable extends Error {}

export function validConfig(config: RemoteConfig) {
  try {
    const resource = new URL(config.resource), issuer = new URL(config.issuer);
    return resource.protocol === 'https:' && issuer.protocol === 'https:' &&
      !resource.username && !resource.password && !resource.search && !resource.hash &&
      !issuer.username && !issuer.password && !issuer.search && !issuer.hash &&
      resource.href === config.resource && resource.pathname === '/api/mcp/expenses' &&
      issuer.pathname === '/auth/v1' && config.clientIds.every(id => z.uuid().safeParse(id).success);
  } catch { return false; }
}
export const metadataUrl = (config: RemoteConfig) => new URL(`/.well-known/oauth-protected-resource${new URL(config.resource).pathname}`, config.resource).href;
export function metadata(config: RemoteConfig) {
  return { resource: config.resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header'],
    // These are provider identity scopes. Finance permissions are separately enforced in SQL.
    scopes_supported: ['openid'], resource_name: 'Finance Tracker expense logging' };
}

export function tokenVerifier(config: RemoteConfig, key?: JWTVerifyGetKey) {
  const jwks = key ?? createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 });
  return async (token: string): Promise<Principal> => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer, audience: 'authenticated', algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat', 'session_id', 'client_id', 'role', 'finance_mcp_resource', 'finance_mcp_permissions'],
      maxTokenAge: '1h', clockTolerance: 0,
    }).catch(error => {
      if (error instanceof errors.JWTExpired || error instanceof errors.JWTClaimValidationFailed ||
        error instanceof errors.JWTInvalid || error instanceof errors.JWSInvalid ||
        error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JOSEAlgNotAllowed || error instanceof errors.JOSENotSupported) throw error;
      throw new AuthenticationUnavailable('Token verification service unavailable');
    });
    const grantedPermissions = payload.finance_mcp_permissions;
    // Supabase Data API uses aud=authenticated. A signed, client-pinned resource
    // claim supplies MCP resource binding; ordinary Supabase sessions are rejected.
    if (!z.uuid().safeParse(payload.sub).success || !z.uuid().safeParse(payload.session_id).success ||
      typeof payload.client_id !== 'string' || !config.clientIds.includes(payload.client_id) ||
      payload.role !== 'finance_mcp' || payload.finance_mcp_resource !== config.resource || payload.is_anonymous !== false ||
      !Array.isArray(grantedPermissions) || !permissions.every(p => grantedPermissions.includes(p)))
      throw new Error('Unauthorized');
    return { owner: payload.sub!, clientId: payload.client_id, sessionId: payload.session_id as string, token };
  };
}
