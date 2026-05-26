import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generatePasscodesFromShowId,
  generateRoleCode,
  generateShowPasscodes,
  type ShowPasscodeRole,
} from './passcodes';

const PASSCODE_SHAPE = /^[ajse][a-z0-9]{4}$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

describe('generatePasscodesFromShowId', () => {
  const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('generates correct passcodes from a valid UUID', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result).toEqual({
      admin: 'ae5f6',
      judge: 'j7890',
      steward: 'sabcd',
      exhibitor: 'eef12',
    });
  });

  it('returns null for a string with no hyphens', () => {
    expect(generatePasscodesFromShowId('notauuid')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(generatePasscodesFromShowId('')).toBeNull();
  });

  it('returns null when segments are missing', () => {
    expect(generatePasscodesFromShowId('a1b2c3d4-e5f6')).toBeNull();
  });

  it('uses only the first 4 chars of segment 4 for the exhibitor code', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result?.exhibitor).toBe('eef12');
    expect(result?.exhibitor).toHaveLength(5); // 'e' prefix + 4 chars
  });

  it('prefixes each code with the correct role letter', () => {
    const result = generatePasscodesFromShowId(validUuid);
    expect(result?.admin.startsWith('a')).toBe(true);
    expect(result?.judge.startsWith('j')).toBe(true);
    expect(result?.steward.startsWith('s')).toBe(true);
    expect(result?.exhibitor.startsWith('e')).toBe(true);
  });
});

describe('generateRoleCode', () => {
  it.each<[ShowPasscodeRole, string]>([
    ['admin', 'a'],
    ['judge', 'j'],
    ['steward', 's'],
    ['exhibitor', 'e'],
  ])('emits a 5-char [%s] code prefixed with %s and matching the shape regex', (role, letter) => {
    const code = generateRoleCode(role);
    expect(code).toHaveLength(5);
    expect(code.startsWith(letter)).toBe(true);
    expect(code).toMatch(PASSCODE_SHAPE);
  });

  it('uses crypto.getRandomValues and never Math.random', () => {
    const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const mathRandomSpy = vi.spyOn(Math, 'random');
    try {
      generateRoleCode('admin');
      expect(cryptoSpy).toHaveBeenCalled();
      expect(mathRandomSpy).not.toHaveBeenCalled();
    } finally {
      cryptoSpy.mockRestore();
      mathRandomSpy.mockRestore();
    }
  });

  it('keeps drawing bytes until 4 unbiased samples are accepted', () => {
    // Force the rejection path: first 8 bytes all ≥ 252 (rejected), then
    // 8 usable bytes. The function must loop and re-fill until it has 4
    // accepted samples — confirms rejection sampling is wired in.
    const sequences = [
      new Uint8Array([252, 253, 254, 255, 252, 253, 254, 255]),
      new Uint8Array([0, 36, 72, 108, 0, 0, 0, 0]),
    ];
    let call = 0;
    const spy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(buf: T): T => {
        if (buf instanceof Uint8Array) {
          buf.set(sequences[call++] ?? sequences[sequences.length - 1]!);
        }
        return buf;
      });
    try {
      const code = generateRoleCode('judge');
      // 4 accepted bytes from the second draw: 0 → 'a', 36 mod 36 = 0 → 'a',
      // 72 mod 36 = 0 → 'a', 108 mod 36 = 0 → 'a'.
      expect(code).toBe('jaaaa');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('generateShowPasscodes', () => {
  it('emits all four role codes matching the shape regex', () => {
    const codes = generateShowPasscodes();
    expect(codes.admin).toMatch(PASSCODE_SHAPE);
    expect(codes.judge).toMatch(PASSCODE_SHAPE);
    expect(codes.steward).toMatch(PASSCODE_SHAPE);
    expect(codes.exhibitor).toMatch(PASSCODE_SHAPE);
  });

  it('uses the correct role-letter prefix for each field', () => {
    const codes = generateShowPasscodes();
    expect(codes.admin[0]).toBe('a');
    expect(codes.judge[0]).toBe('j');
    expect(codes.steward[0]).toBe('s');
    expect(codes.exhibitor[0]).toBe('e');
  });

  it('produces all four codes distinct from one another (different role letters guarantee this)', () => {
    const codes = generateShowPasscodes();
    const set = new Set(Object.values(codes));
    expect(set.size).toBe(4);
  });

  it('returns a fresh set on each call (entropy check)', () => {
    // With ~6.7M values per role, two consecutive calls colliding has
    // probability 1/1.7M per role — well below test flake tolerance even
    // over years of CI runs.
    const a = generateShowPasscodes();
    const b = generateShowPasscodes();
    expect(a).not.toEqual(b);
  });

  it('distributes alphabet chars roughly uniformly across many generations', () => {
    // Statistical sanity check: the 36-char alphabet should appear with
    // similar frequencies in the random body of each code. With 10000
    // generations × 4 codes × 4 random chars = 160000 samples, each char
    // has an expected count of 160000/36 ≈ 4444. Chebyshev-style: |count
    // − expected| < 5 * stddev catches a stuck/biased RNG without flaking
    // on healthy ones. (stddev ≈ √(N·p·(1−p)) ≈ 65.7.)
    const N = 10_000;
    const counts = new Map<string, number>(
      [...ALPHABET].map((c) => [c, 0]),
    );
    for (let i = 0; i < N; i++) {
      const codes = generateShowPasscodes();
      for (const code of Object.values(codes)) {
        for (const c of code.slice(1)) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      }
    }
    const expected = (N * 4 * 4) / 36;
    const stddev = Math.sqrt(expected * (1 - 1 / 36));
    const tolerance = 5 * stddev;
    for (const [char, count] of counts) {
      expect(
        Math.abs(count - expected),
        `char ${char} appeared ${count} times (expected ~${expected.toFixed(0)}, tolerance ±${tolerance.toFixed(0)})`,
      ).toBeLessThan(tolerance);
    }
  });
});

describe('generateRoleCode — environment guards', () => {
  let originalCrypto: Crypto;
  beforeEach(() => {
    originalCrypto = globalThis.crypto;
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  it('throws when crypto.getRandomValues is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(() => generateRoleCode('admin')).toThrow();
  });
});
