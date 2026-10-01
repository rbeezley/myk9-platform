// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { authoritativeEntryFeeCents } from './authoritativeFee';

// MYK9-879: the exhibitor's junior-handler declaration. The charged fee is
// LEAST(junior fee, normal fee), the same rule as private.price_entry_fee and the
// client's getShowEntryFee; a NULL or 0 junior fee is no tier. Nothing here reads
// a date of birth or knows who owns the dog: the declaration is about the handler.
const base = {
  showPreEntryFee: 30,
  showDayOfShowFee: 45,
  showStartDate: '2026-10-10',
  classEntryFee: 28,
  nowIso: '2026-10-01T12:00:00Z',
  showJuniorHandlerFee: 15,
};

describe('authoritativeEntryFeeCents with a junior declaration', () => {
  it('charges the junior fee when declared on a show with a junior tier', () => {
    expect(authoritativeEntryFeeCents({ ...base, juniorDeclared: true })).toBe(1500);
  });

  it('charges the normal fee when not declared (an adult handler)', () => {
    expect(authoritativeEntryFeeCents({ ...base, juniorDeclared: false })).toBe(3000);
    expect(authoritativeEntryFeeCents(base)).toBe(3000);
  });

  it('is capped at the normal fee when the junior tier is above it', () => {
    expect(
      authoritativeEntryFeeCents({ ...base, showJuniorHandlerFee: 40, juniorDeclared: true })
    ).toBe(3000);
  });

  it('caps against the day-of fee on show day, and the junior fee still wins below it', () => {
    const showDay = { ...base, nowIso: '2026-10-10T08:00:00Z', juniorDeclared: true };
    expect(authoritativeEntryFeeCents(showDay)).toBe(1500);
    expect(authoritativeEntryFeeCents({ ...showDay, showJuniorHandlerFee: 50 })).toBe(4500);
  });

  it('caps against the class fee when the show has no fee of its own', () => {
    const classFeeOnly = {
      ...base,
      showPreEntryFee: null,
      showDayOfShowFee: null,
      juniorDeclared: true,
    };
    expect(authoritativeEntryFeeCents(classFeeOnly)).toBe(1500);
    expect(authoritativeEntryFeeCents({ ...classFeeOnly, showJuniorHandlerFee: 99 })).toBe(2800);
  });

  it('treats a NULL, zero, negative or garbage junior fee as no tier', () => {
    for (const showJuniorHandlerFee of [null, 0, '0.00', -5, 'abc', undefined]) {
      expect(
        authoritativeEntryFeeCents({ ...base, showJuniorHandlerFee, juniorDeclared: true })
      ).toBe(3000);
    }
  });

  it('parses a DECIMAL string junior fee', () => {
    expect(
      authoritativeEntryFeeCents({ ...base, showJuniorHandlerFee: '$12.50', juniorDeclared: true })
    ).toBe(1250);
  });

  it('is exactly the cents the client quotes (getShowEntryFee min rule) at a half-cent boundary', () => {
    expect(
      authoritativeEntryFeeCents({ ...base, showJuniorHandlerFee: 14.99, juniorDeclared: true })
    ).toBe(1499);
  });
});
