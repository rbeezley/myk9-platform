import { createHmac, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GITHUB_OIDC_ISSUER, verifyRunToken, type Jwk } from './oidc-token.ts';

// A throwaway signing key stands in for GitHub's. Its public half is published
// the way GitHub's JWKS publishes it (kty RSA, alg RS256, use sig, a kid).
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';

function jwk(key: KeyObject, kid: string): Jwk {
  return { ...(key.export({ format: 'jwk' }) as Jwk), kid, alg: 'RS256', use: 'sig' };
}

const JWKS = { keys: [jwk(publicKey, KID)] };
const NOW = 1_800_000_000;
const AUDIENCE = 'myk9-independent-review';
const REPOSITORY = 'rbeezley/myk9-platform';
const WORKFLOW_SHA = 'c'.repeat(40);

const CLAIMS = {
  iss: GITHUB_OIDC_ISSUER,
  aud: AUDIENCE,
  sub: 'repo:rbeezley/myk9-platform:pull_request',
  iat: NOW - 30,
  nbf: NOW - 30,
  exp: NOW + 270,
  repository: REPOSITORY,
  workflow_ref: `${REPOSITORY}/.github/workflows/cloud-independent-review.yml@refs/heads/main`,
  workflow_sha: WORKFLOW_SHA,
  run_id: '40351720197',
  run_attempt: '1',
  event_name: 'pull_request_target',
};

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function token(
  claims: Record<string, unknown> = CLAIMS,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: KID },
  key: KeyObject = privateKey
): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  return `${input}.${b64url(sign('RSA-SHA256', Buffer.from(input), key))}`;
}

const OPTIONS = { jwks: JWKS, audience: AUDIENCE, repository: REPOSITORY, nowSeconds: NOW };

const invalid = { invalid: expect.any(String) };

describe('verifyRunToken', () => {
  it('returns the run claims of a token GitHub signed for this repository and audience', () => {
    expect(verifyRunToken(token(), OPTIONS)).toEqual({
      repository: REPOSITORY,
      workflowRef: CLAIMS.workflow_ref,
      workflowSha: WORKFLOW_SHA,
      runId: 40351720197,
      runAttempt: 1,
      event: 'pull_request_target',
    });
  });

  it('accepts numeric run ids and an audience list that includes ours', () => {
    const t = token({ ...CLAIMS, run_id: 40351720197, run_attempt: 2, aud: ['other', AUDIENCE] });
    expect(verifyRunToken(t, OPTIONS)).toMatchObject({ runId: 40351720197, runAttempt: 2 });
  });

  describe('refuses a token whose signature does not hold', () => {
    it('a payload edited after signing', () => {
      const [h, , s] = token().split('.');
      const forged = b64url(
        JSON.stringify({ ...CLAIMS, workflow_ref: 'x/y/.github/workflows/z.yml@refs/heads/evil' })
      );
      expect(verifyRunToken(`${h}.${forged}.${s}`, OPTIONS)).toEqual(invalid);
    });

    it('a different key presenting a published kid', () => {
      expect(verifyRunToken(token(CLAIMS, undefined, other.privateKey), OPTIONS)).toEqual(invalid);
    });

    it('a kid the key set does not publish', () => {
      expect(verifyRunToken(token(CLAIMS, { alg: 'RS256', kid: 'unknown' }), OPTIONS)).toEqual(
        invalid
      );
    });

    it('no kid at all', () => {
      expect(verifyRunToken(token(CLAIMS, { alg: 'RS256' }), OPTIONS)).toEqual(invalid);
    });

    it('alg none with an empty signature', () => {
      const input = `${b64url(JSON.stringify({ alg: 'none', kid: KID }))}.${b64url(JSON.stringify(CLAIMS))}`;
      expect(verifyRunToken(`${input}.`, OPTIONS)).toEqual(invalid);
    });

    it('HS256 keyed with the public key, the classic algorithm confusion', () => {
      const header = { alg: 'HS256', kid: KID };
      const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(CLAIMS))}`;
      const pem = publicKey.export({ type: 'spki', format: 'pem' });
      const mac = createHmac('sha256', pem).update(input).digest();
      expect(verifyRunToken(`${input}.${b64url(mac)}`, OPTIONS)).toEqual(invalid);
    });

    // The signature is always checked as RS256, so none/HS256 fail there too;
    // only the header check refuses a token that misstates its algorithm.
    it('a header naming another algorithm over a genuine RS256 signature', () => {
      expect(verifyRunToken(token(CLAIMS, { alg: 'RS512', kid: KID }), OPTIONS)).toEqual(invalid);
    });

    it('a published key that is not an RS256 signing key', () => {
      const jwks = { keys: [{ ...jwk(publicKey, KID), use: 'enc' }] };
      expect(verifyRunToken(token(), { ...OPTIONS, jwks })).toEqual(invalid);
    });
  });

  describe('refuses a validly signed token that is not for us', () => {
    it.each<[string, Record<string, unknown>]>([
      ['another issuer', { iss: 'https://example.com' }],
      ['another audience', { aud: 'sts.amazonaws.com' }],
      ['an audience list without ours', { aud: ['a', 'b'] }],
      ['another repository', { repository: 'fork/myk9-platform' }],
    ])('%s', (_label, change) => {
      expect(verifyRunToken(token({ ...CLAIMS, ...change }), OPTIONS)).toEqual(invalid);
    });
  });

  describe('enforces the token lifetime', () => {
    it('refuses an expired token', () => {
      expect(verifyRunToken(token({ ...CLAIMS, exp: NOW - 120 }), OPTIONS)).toEqual(invalid);
    });

    it('accepts an expired token when the caller only needs provenance', () => {
      const t = token({ ...CLAIMS, exp: NOW - 86_400 });
      expect(verifyRunToken(t, { ...OPTIONS, allowExpired: true })).toMatchObject({
        runAttempt: 1,
      });
    });

    it('allows a minute of clock skew', () => {
      expect(verifyRunToken(token({ ...CLAIMS, exp: NOW - 30 }), OPTIONS)).toMatchObject({
        runAttempt: 1,
      });
    });

    it.each<[string, Record<string, unknown>]>([
      ['not yet valid', { nbf: NOW + 600 }],
      ['issued in the future', { iat: NOW + 600 }],
      ['no expiry', { exp: undefined }],
    ])('refuses a token %s, even when expiry is allowed', (_label, change) => {
      const t = token({ ...CLAIMS, ...change });
      expect(verifyRunToken(t, { ...OPTIONS, allowExpired: true })).toEqual(invalid);
    });
  });

  describe('refuses missing or malformed run claims', () => {
    it.each<[string, Record<string, unknown>]>([
      ['no workflow_ref', { workflow_ref: undefined }],
      ['a short workflow_sha', { workflow_sha: 'c'.repeat(12) }],
      ['a run_id that is not a number', { run_id: '40351720197abc' }],
      ['a run_attempt of 0', { run_attempt: '0' }],
      ['no event_name', { event_name: undefined }],
    ])('%s', (_label, change) => {
      expect(verifyRunToken(token({ ...CLAIMS, ...change }), OPTIONS)).toEqual(invalid);
    });
  });

  it.each([
    ['two segments', 'a.b'],
    ['an empty string', ''],
    ['a header that is not JSON', `${b64url('not json')}.${b64url('{}')}.sig`],
    [
      'a payload that is a JSON array',
      `${b64url('{"alg":"RS256","kid":"test-key-1"}')}.${b64url('[]')}.sig`,
    ],
  ])('returns invalid, never throws, for %s', (_label, value) => {
    expect(verifyRunToken(value, OPTIONS)).toEqual(invalid);
  });
});
