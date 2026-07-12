/**
 * Compare complete strings without returning early on length or value mismatches.
 * Webhook credentials are ASCII/base64, so UTF-16 code-unit comparison is stable here.
 */
export function timingSafeEqual(actual: string, expected: string): boolean {
  const length = Math.max(actual.length, expected.length);
  let mismatch = actual.length === expected.length ? 0 : 1;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
