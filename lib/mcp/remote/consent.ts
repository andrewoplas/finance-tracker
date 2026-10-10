import { z } from 'zod';

export function consentPath(id: string) {
  return `/oauth/consent?authorization_id=${z.uuid().parse(id)}`;
}
export function loginReturnPath(value: string | null) {
  if (!value) return '/';
  try {
    const url = new URL(value, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || url.pathname !== '/oauth/consent' || url.hash ||
      [...url.searchParams.keys()].some(key => key !== 'authorization_id')) return '/';
    return consentPath(url.searchParams.get('authorization_id') ?? '');
  } catch { return '/'; }
}
// The provider supplies the authorization code callback, never form/query data.
// Still pin it to the exact registered callback (copy from the plugin builder).
export function oauthCallback(value: string, registered: string) {
  const url = new URL(value), allowed = new URL(registered);
  if (allowed.protocol !== 'https:' || allowed.search || allowed.hash || allowed.username || allowed.password ||
    url.origin !== allowed.origin || url.pathname !== allowed.pathname || url.username || url.password || url.hash)
    throw new Error('OAuth callback unavailable');
  return url.href;
}
