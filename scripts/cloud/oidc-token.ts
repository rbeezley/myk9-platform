/**
 * Verify a GitHub Actions OIDC token and return the run it vouches for
 * (MYK9-1398; plan Task 2.2). This is the only unforgeable record of which
 * workflow file and commit a run executed: for `pull_request_target` the run
 * API reports the PR's head and its current base (Codex, #3284). The claims
 * returned here are what validateReviewPublication compares.
 *
 * Checked against GitHub's discovery document (2026-10-26): issuer
 * `https://token.actions.githubusercontent.com`, RS256 only, RSA keys named by
 * `kid` at /.well-known/jwks. The docs do not say whether run_id and
 * run_attempt are strings or numbers, so both are accepted when they are
 * positive integers. The caller fetches the key set; this module is pure.
 *
 * Fail closed: anything malformed, unsigned, mis-signed, misaddressed or
 * expired is `{ invalid }`, never an exception.
 */
import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const CLOCK_SKEW_SECONDS = 60;

export type Jwk = { kty: string; kid?: string; alg?: string; use?: string; [key: string]: unknown };

export type RunClaims = {
  repository: string;
  workflowRef: string;
  workflowSha: string;
  runId: number;
  runAttempt: number;
  event: string;
};

export type VerifyOptions = {
  jwks: { keys: Jwk[] };
  audience: string;
  repository: string;
  nowSeconds: number;
  /**
   * For a later reader that needs only provenance (the gate re-evaluating
   * evidence): the signature still binds the claims to one run, and expiry
   * protects bearer use, not what the token attests. Never set it when the
   * token is about to be used as a credential.
   */
  allowExpired?: boolean;
};

type Claims = Record<string, unknown>;

function decodeJson(segment: string): Claims | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Claims)
      : null;
  } catch {
    return null;
  }
}

function signatureHolds(input: string, signature: string, key: Jwk): boolean {
  try {
    const publicKey = createPublicKey({ key: key as JsonWebKey, format: 'jwk' });
    return verify('RSA-SHA256', Buffer.from(input), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

function positiveInt(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9][0-9]*$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

function lifetimeProblem(claims: Claims, options: VerifyOptions): string | null {
  const { nowSeconds: now } = options;
  const { exp, nbf, iat } = claims;
  if (typeof exp !== 'number') return 'token has no expiry';
  if (!options.allowExpired && exp + CLOCK_SKEW_SECONDS < now) return 'token has expired';
  if (typeof nbf === 'number' && nbf - CLOCK_SKEW_SECONDS > now) return 'token is not yet valid';
  if (typeof iat === 'number' && iat - CLOCK_SKEW_SECONDS > now)
    return 'token was issued in the future';
  return null;
}

export function verifyRunToken(
  token: string,
  options: VerifyOptions
): RunClaims | { invalid: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { invalid: 'not a three-part JWT' };
  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;
  const header = decodeJson(headerPart);
  const claims = decodeJson(payloadPart);
  if (!header || !claims) return { invalid: 'header or payload is not a JSON object' };

  // RS256 only: never let the token choose a weaker or symmetric algorithm.
  if (header.alg !== 'RS256') return { invalid: `algorithm ${String(header.alg)} is not RS256` };
  const key = options.jwks.keys.find(k => k.kid === header.kid);
  if (typeof header.kid !== 'string' || !key) return { invalid: 'signing key is not published' };
  if (key.kty !== 'RSA' || (key.alg ?? 'RS256') !== 'RS256' || (key.use ?? 'sig') !== 'sig') {
    return { invalid: 'published key is not an RS256 signing key' };
  }
  if (!signatureHolds(`${headerPart}.${payloadPart}`, signaturePart, key)) {
    return { invalid: 'signature does not verify' };
  }

  if (claims.iss !== GITHUB_OIDC_ISSUER) return { invalid: `issuer ${String(claims.iss)}` };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) return { invalid: 'token is for another audience' };
  if (claims.repository !== options.repository)
    return { invalid: 'token is for another repository' };
  const lifetime = lifetimeProblem(claims, options);
  if (lifetime) return { invalid: lifetime };

  const runId = positiveInt(claims.run_id);
  const runAttempt = positiveInt(claims.run_attempt);
  const { workflow_ref: workflowRef, workflow_sha: workflowSha, event_name: event } = claims;
  if (typeof workflowRef !== 'string' || workflowRef === '') return { invalid: 'no workflow_ref' };
  if (typeof workflowSha !== 'string' || !/^[0-9a-f]{40}$/.test(workflowSha)) {
    return { invalid: 'malformed workflow_sha' };
  }
  if (runId === null || runAttempt === null) return { invalid: 'malformed run_id or run_attempt' };
  if (typeof event !== 'string' || event === '') return { invalid: 'no event_name' };

  return { repository: options.repository, workflowRef, workflowSha, runId, runAttempt, event };
}
