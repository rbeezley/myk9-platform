/** Test-only: unsigned JWT-shaped tokens carrying the claims the step-up code reads. */
function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function testJwt(sub: string, amrAgeSeconds: number | null, nonce = ''): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub,
    role: 'authenticated',
    ...(amrAgeSeconds === null
      ? {}
      : { amr: [{ method: 'password', timestamp: now - amrAgeSeconds }] }),
    nonce,
  };
  return `${base64url('{"alg":"HS256"}')}.${base64url(JSON.stringify(claims))}.sig`;
}
