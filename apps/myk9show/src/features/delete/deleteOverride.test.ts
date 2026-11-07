import { describe, expect, it } from 'vitest';
import {
  amountMatches,
  nameMatches,
  overrideArmedBy,
  supportsAdminOverride,
  trimmedReason,
} from './deleteOverride';
import { EMPTY_PREVIEW } from './deletePreview';

describe('supportsAdminOverride', () => {
  it('is show, trial and class only', () => {
    expect(['show', 'trial', 'class'].every(kind => supportsAdminOverride(kind as 'show'))).toBe(
      true
    );
    for (const kind of ['entry', 'dog', 'person', 'club'] as const) {
      expect(supportsAdminOverride(kind)).toBe(false);
    }
  });
});

describe('typed confirmations', () => {
  it('matches the name ignoring case and outer spaces, never a part of it', () => {
    expect(nameMatches('  heartland classic ', 'Heartland Classic')).toBe(true);
    expect(nameMatches('Heartland', 'Heartland Classic')).toBe(false);
    expect(nameMatches('', '')).toBe(false);
  });

  it('matches the dollar amount to the cent in the usual ways of typing it', () => {
    for (const typed of ['90', '90.00', '$90', '$ 90.0', '90.']) {
      expect(amountMatches(typed, 90)).toBe(typed !== '90.');
    }
    expect(amountMatches('1,030.50', 1030.5)).toBe(true);
    expect(amountMatches('89.99', 90)).toBe(false);
    expect(amountMatches('', 90)).toBe(false);
    expect(amountMatches('ninety', 90)).toBe(false);
  });

  it('trims the reason', () => {
    expect(trimmedReason('  because  ')).toBe('because');
  });
});

describe('overrideArmedBy', () => {
  const cash = { ...EMPTY_PREVIEW, paid: 2, blocking: 2, paid_amount: 60 };
  const online = { ...cash, stripe_retained: 1, stripe_retained_amount: 30 };
  const typed = { name: 'Show', amount: '', reason: 'Why' };

  it('needs only name and reason when nothing was paid online', () => {
    expect(overrideArmedBy(typed, 'Show', cash)).toBe(true);
    expect(overrideArmedBy({ ...typed, reason: '  ' }, 'Show', cash)).toBe(false);
    expect(overrideArmedBy({ ...typed, name: 'Sho' }, 'Show', cash)).toBe(false);
  });

  it('also needs the online total when something was paid online', () => {
    expect(overrideArmedBy(typed, 'Show', online)).toBe(false);
    expect(overrideArmedBy({ ...typed, amount: '60' }, 'Show', online)).toBe(false);
    expect(overrideArmedBy({ ...typed, amount: '30' }, 'Show', online)).toBe(true);
  });
});
