import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import {
  getUserStatus,
  getUserFullName,
  getStatusConfig,
  getDeletedStatusConfig,
  highlightSearchTerm,
} from './utils';

describe('getUserStatus', () => {
  it('returns active for users with active status', () => {
    expect(getUserStatus({ status: 'active' } as User)).toBe('active');
  });

  it('returns suspended for suspended users', () => {
    expect(getUserStatus({ status: 'suspended' } as User)).toBe('suspended');
  });

  it('defaults to active when status is undefined', () => {
    expect(getUserStatus({} as User)).toBe('active');
  });
});

describe('getUserFullName', () => {
  it('falls back to a readable placeholder rather than "undefined undefined"', () => {
    expect(getUserFullName({} as User)).toBe('Unnamed User');
    expect(getUserFullName({ firstName: 'Ada' } as User)).toBe('Ada');
  });
});

// These configs used to carry inline hex (#34C759 / #EF4444 / #8E8E93), which
// rendered at ~2:1 against its own 10% tint in light mode and did not change in
// dark mode at all. They must stay on the --chip-* pairs, which ship both modes.
describe('status configs use --chip-* token pairs, never inline hex', () => {
  const HEX = /#[0-9a-f]{3,8}/i;

  it('active status is a green chip pair', () => {
    const config = getStatusConfig('active');
    expect(config.label).toBe('Active');
    expect(config.chipClass).toContain('var(--chip-green-bg)');
    expect(config.chipClass).toContain('var(--chip-green-fg)');
    expect(config.chipClass).not.toMatch(HEX);
    expect(config.dotClass).not.toMatch(HEX);
  });

  it('suspended status is a red chip pair', () => {
    const config = getStatusConfig('suspended');
    expect(config.label).toBe('Suspended');
    expect(config.chipClass).toContain('var(--chip-red-bg)');
    expect(config.chipClass).toContain('var(--chip-red-fg)');
    expect(config.chipClass).not.toMatch(HEX);
  });

  it('defaults to the active config for an unknown status', () => {
    expect(getStatusConfig('unknown').label).toBe('Active');
  });

  it('deleted status is a stone chip pair, labelled in plain language', () => {
    const config = getDeletedStatusConfig();
    expect(config.label).toBe('Removed');
    expect(config.chipClass).toContain('var(--chip-stone-bg)');
    expect(config.chipClass).not.toMatch(HEX);
  });
});

describe('highlightSearchTerm', () => {
  // Regression: the previous implementation re-tested each split part with the
  // same /g regex, so `lastIndex` carried between calls and every second match
  // lost its highlight.
  const marks = (nodes: React.ReactNode) =>
    (nodes as React.ReactElement[]).filter(part => typeof part === 'object' && part !== null);

  it('highlights every occurrence, not every other one', () => {
    expect(marks(highlightSearchTerm('aXaXa', 'a'))).toHaveLength(3);
  });

  it('highlights a repeated term inside an email', () => {
    expect(marks(highlightSearchTerm('anna@anna.example', 'anna'))).toHaveLength(2);
  });

  it('is case-insensitive', () => {
    expect(marks(highlightSearchTerm('Anna and ANNA', 'anna'))).toHaveLength(2);
  });

  it('returns the plain string when there is no search term', () => {
    expect(highlightSearchTerm('Anna', '   ')).toBe('Anna');
  });

  it('treats regex characters in the term literally', () => {
    expect(marks(highlightSearchTerm('a.b', '.'))).toHaveLength(1);
    expect(marks(highlightSearchTerm('axb', '.'))).toHaveLength(0);
  });
});
