export interface ShowPasscodes {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
}

export type ShowPasscodeRole = keyof ShowPasscodes;

const PASSCODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
// 252 = floor(256 / 36) * 36 — highest multiple of 36 that fits in a byte.
// Rejection sampling above this value keeps the alphabet distribution
// uniform; naive `byte % 36` would over-represent the first 4 chars by ~7%.
const HIGHEST_UNBIASED_BYTE = 252;
const ROLE_LETTERS: Record<ShowPasscodeRole, string> = {
  admin: 'a',
  judge: 'j',
  steward: 's',
  exhibitor: 'e',
};

/**
 * Generates a single role-prefixed 5-char passcode.
 * Format: `[role-letter][4 random chars from a-z0-9]`.
 *
 * Uses `crypto.getRandomValues` with rejection sampling. Never calls
 * `Math.random` (which is a non-cryptographic PRNG).
 */
export function generateRoleCode(role: ShowPasscodeRole): string {
  let code = ROLE_LETTERS[role];
  // Draw 8 bytes per iteration to amortize the ~1.6%-per-draw rejection
  // rate. In the overwhelming majority of calls a single iteration suffices.
  const buf = new Uint8Array(8);
  while (code.length < 5) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && code.length < 5; i++) {
      const b = buf[i]!;
      if (b < HIGHEST_UNBIASED_BYTE) {
        code += PASSCODE_ALPHABET[b % 36];
      }
    }
  }
  return code;
}

/**
 * Generates 4 independently random passcodes — one per role — using
 * `crypto.getRandomValues`. Each call returns a fresh set; no derivation
 * from any external value (in particular no derivation from the show id,
 * which would let anyone with the id re-compute every code).
 *
 * Plaintext output should be passed straight to the
 * `insert_show_passcodes(show_id, codes)` RPC and then displayed to the
 * secretary once for distribution. The application should not persist or
 * log the plaintexts.
 */
export function generateShowPasscodes(): ShowPasscodes {
  return {
    admin: generateRoleCode('admin'),
    judge: generateRoleCode('judge'),
    steward: generateRoleCode('steward'),
    exhibitor: generateRoleCode('exhibitor'),
  };
}

/**
 * Derives four role passcodes from a show UUID.
 *
 * UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 segments)
 *   Admin     → 'a' + segment[1]            (4 hex chars)
 *   Judge     → 'j' + segment[2]            (4 hex chars)
 *   Steward   → 's' + segment[3]            (4 hex chars)
 *   Exhibitor → 'e' + segment[4].slice(0,4) (first 4 of 12 hex chars)
 *
 * @deprecated Legacy myK9Q license-key derivation. Removed in Phase 0 step 4
 * of the myK9Show + myK9Q unification — use {@link generateShowPasscodes}
 * for new shows (random + stored hashed in `show_passcodes`).
 */
export function generatePasscodesFromShowId(showId: string): ShowPasscodes | null {
  const [, seg1, seg2, seg3, seg4] = showId.split('-');
  if (!seg1 || !seg2 || !seg3 || !seg4) return null;
  return {
    admin: `a${seg1}`,
    judge: `j${seg2}`,
    steward: `s${seg3}`,
    exhibitor: `e${seg4.slice(0, 4)}`,
  };
}
