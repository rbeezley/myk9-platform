import { describe, it, expect } from 'vitest';
import {
  badgeClass,
  formatRingTime,
  getCheckinLabel,
  getCheckinTier,
  getSyncLabel,
  getSyncTier,
  getVisibilityLabel,
  getVisibilityTier,
} from './atShowChrome.helpers';

describe('badgeClass', () => {
  it('maps every tier to a distinct class string', () => {
    const tiers = ['success', 'warning', 'info', 'neutral', 'destructive', 'live'] as const;
    const classes = tiers.map(badgeClass);
    expect(new Set(classes).size).toBe(tiers.length);
  });

  it('uses high-contrast chip tokens for the neutral tier (no muted text)', () => {
    expect(badgeClass('neutral')).toContain('var(--chip-stone-bg)');
    expect(badgeClass('neutral')).toContain('var(--chip-stone-fg)');
    expect(badgeClass('neutral')).not.toContain('text-muted-foreground');
  });

  it('uses semantic tokens for coloured tiers (dark mode handled automatically)', () => {
    expect(badgeClass('success')).toContain('text-success');
    expect(badgeClass('destructive')).toContain('text-destructive');
  });

  it('uses the Ring Green --live token (not success) for the live tier', () => {
    // DESIGN.md "Ring Green Rule": live judging is Ring Green, never --success.
    expect(badgeClass('live')).toContain('var(--live)');
    expect(badgeClass('live')).not.toContain('text-success');
  });
});

describe('getVisibilityLabel / getVisibilityTier', () => {
  it('labels presets and falls back to raw', () => {
    expect(getVisibilityLabel('open')).toBe('Open');
    expect(getVisibilityLabel('standard')).toBe('Standard');
    expect(getVisibilityLabel('review')).toBe('Review');
    expect(getVisibilityLabel('custom')).toBe('Custom');
    expect(getVisibilityLabel(undefined)).toBeNull();
    expect(getVisibilityLabel('other')).toBe('other');
  });

  it('tiers presets, defaulting to info', () => {
    expect(getVisibilityTier('open')).toBe('success');
    expect(getVisibilityTier('standard')).toBe('info');
    expect(getVisibilityTier('review')).toBe('warning');
    expect(getVisibilityTier(undefined)).toBe('info');
  });
});

describe('getCheckinLabel / getCheckinTier', () => {
  it('distinguishes self vs table check-in', () => {
    expect(getCheckinLabel(true)).toBe('Self');
    expect(getCheckinLabel(false)).toBe('Table');
    expect(getCheckinTier(true)).toBe('success');
    expect(getCheckinTier(false)).toBe('neutral');
  });
});

describe('getSyncLabel / getSyncTier', () => {
  it('labels each sync status', () => {
    expect(getSyncLabel('synced')).toBe('Synced');
    expect(getSyncLabel('syncing')).toBe('Syncing…');
    expect(getSyncLabel('offline')).toBe('Offline');
    expect(getSyncLabel('error')).toBe('Sync error');
  });

  it('tiers each sync status', () => {
    expect(getSyncTier('synced')).toBe('success');
    expect(getSyncTier('syncing')).toBe('info');
    expect(getSyncTier('offline')).toBe('neutral');
    expect(getSyncTier('error')).toBe('destructive');
  });
});

describe('formatRingTime', () => {
  it('returns null when seconds is undefined', () => {
    expect(formatRingTime(undefined)).toBeNull();
  });

  it('returns null for non-finite or negative input (e.g. a stray "TBD" string)', () => {
    expect(formatRingTime(NaN)).toBeNull();
    expect(formatRingTime(-5)).toBeNull();
    // Upstream adapters may put a placeholder string in this numeric field.
    expect(formatRingTime('TBD' as unknown as number)).toBeNull();
  });

  it('formats whole minutes and zero-pads seconds', () => {
    expect(formatRingTime(0)).toBe('0:00');
    expect(formatRingTime(5)).toBe('0:05');
    expect(formatRingTime(60)).toBe('1:00');
    expect(formatRingTime(125)).toBe('2:05');
    expect(formatRingTime(610)).toBe('10:10');
  });
});
