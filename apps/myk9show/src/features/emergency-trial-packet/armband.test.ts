import { describe, expect, it } from 'vitest';
import {
  UNASSIGNED_ARMBAND_DISPLAY,
  armbandSortKey,
  compareArmbands,
  formatPacketArmband,
  normalizePacketArmband,
} from './armband';

describe('armbandSortKey', () => {
  it('reads the leading digits of a plain armband', () => {
    expect(armbandSortKey('104')).toBe(104);
  });

  it('sorts a suffixed armband by the number it extends', () => {
    // MYK9-243: "12A" is a dog added beside 12, so it belongs beside 12 in the
    // running order -- not at the front, where the old `0` sentinel put it.
    expect(armbandSortKey('12A')).toBe(12);
  });

  it('has no key for an unassigned armband', () => {
    expect(armbandSortKey(null)).toBeNull();
    expect(armbandSortKey('')).toBeNull();
  });

  it('has no key for a label with no leading digits', () => {
    expect(armbandSortKey('A12')).toBeNull();
  });

  it('caps at nine digits so a long run cannot collapse distinct armbands', () => {
    // Beyond MAX_SAFE_INTEGER distinct labels compare equal, silently merging
    // two dogs' positions.
    expect(armbandSortKey('1234567890123')).toBe(123456789);
  });
});

describe('compareArmbands', () => {
  it('orders numerically, not as text', () => {
    // The bug a text sort produces: "9" after "10".
    expect([...['10', '9', '100']].sort(compareArmbands)).toEqual(['9', '10', '100']);
  });

  it('places a suffixed armband directly after the number it extends', () => {
    expect([...['13', '12A', '12']].sort(compareArmbands)).toEqual(['12', '12A', '13']);
  });

  it('sorts unassigned dogs LAST, never first', () => {
    // The old numeric model gave them 0, which put a dog nobody can identify
    // at the head of the running order.
    expect([...[null, '2', '1']].sort(compareArmbands)).toEqual(['1', '2', null]);
  });
});

describe('formatPacketArmband', () => {
  it('prints the label exactly as issued', () => {
    expect(formatPacketArmband('12A')).toBe('12A');
    expect(formatPacketArmband('104')).toBe('104');
  });

  it('prints an em dash for a genuinely unassigned armband', () => {
    expect(formatPacketArmband(null)).toBe(UNASSIGNED_ARMBAND_DISPLAY);
    expect(formatPacketArmband('   ')).toBe(UNASSIGNED_ARMBAND_DISPLAY);
  });

  it('never prints a bare zero', () => {
    // "0" was the sentinel the RPC emitted for any armband it could not cast.
    // A real armband "0" is not a thing, but the point is that nothing in this
    // path invents one any more -- the value shown is the value issued.
    expect(formatPacketArmband('0')).toBe('0');
    expect(formatPacketArmband(null)).not.toBe('0');
  });
});

describe('normalizePacketArmband', () => {
  it('keeps a text armband verbatim, suffix included', () => {
    expect(normalizePacketArmband('12A')).toBe('12A');
    expect(normalizePacketArmband(' 104 ')).toBe('104');
  });

  it('collapses every "no armband" spelling to null', () => {
    // One representation, so nothing downstream has to know which producer
    // it came from.
    expect(normalizePacketArmband(null)).toBeNull();
    expect(normalizePacketArmband(undefined)).toBeNull();
    expect(normalizePacketArmband('')).toBeNull();
    expect(normalizePacketArmband('   ')).toBeNull();
  });

  it('treats the legacy numeric 0 sentinel as unassigned, not as armband zero', () => {
    expect(normalizePacketArmband(0)).toBeNull();
  });

  it('treats NaN as unassigned', () => {
    // `Number('12A')` upstream produced this; it must not reach paper.
    expect(normalizePacketArmband(Number('12A'))).toBeNull();
  });

  it('renders a real number as its label', () => {
    expect(normalizePacketArmband(104)).toBe('104');
  });
});
