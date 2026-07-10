// supabase/functions/resend-webhook/signature.ts
//
// Pure, Deno-free helpers for comparing Svix webhook signatures in
// constant time. Kept separate from index.ts (which imports Deno/npm
// specifiers at module scope) so this logic is unit-testable under vitest.
// See docs/security-audit-2026-07-10.md SA-023.

/**
 * Constant-time string equality. Always walks the full length of the
 * longer input and never short-circuits on the first mismatching byte,
 * so comparison time does not leak how many leading bytes matched.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * True if `expected` constant-time-matches any of the candidate Svix
 * signatures. Every candidate is compared — the loop does not stop at
 * the first match — so total runtime does not vary by which candidate,
 * if any, matches.
 */
export function matchesAnySignature(candidates: string[], expected: string): boolean {
  let matched = false;
  for (const candidate of candidates) {
    if (timingSafeEqual(candidate, expected)) {
      matched = true;
    }
  }
  return matched;
}
