import { describe, it, expect } from 'vitest';
import {
  badgeClass,
  formatRingTime,
  getCheckinLabel,
  getCheckinTier,
  getClassListStatusTier,
  getClassStatusLabel,
  getClassStatusTier,
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

describe('getClassListStatusTier', () => {
  it('gives ONLY in-progress the Ring Green live tier', () => {
    expect(getClassListStatusTier('in-progress')).toBe('live');
    // Prep / offline-scoring are active but not "a dog in the ring right now".
    expect(getClassListStatusTier('offline-scoring')).not.toBe('live');
    expect(getClassListStatusTier('setup')).not.toBe('live');
  });

  it('maps prep states to warning and a break to info', () => {
    expect(getClassListStatusTier('setup')).toBe('warning');
    expect(getClassListStatusTier('briefing')).toBe('warning');
    expect(getClassListStatusTier('start-time')).toBe('warning');
    expect(getClassListStatusTier('offline-scoring')).toBe('warning');
    expect(getClassListStatusTier('break')).toBe('info');
  });

  it('recedes done / not-started / unknown keys to neutral', () => {
    expect(getClassListStatusTier('completed')).toBe('neutral');
    expect(getClassListStatusTier('no-status')).toBe('neutral');
    expect(getClassListStatusTier('mystery')).toBe('neutral');
  });
});

describe('getClassStatusLabel', () => {
  it('returns null when status is missing', () => {
    expect(getClassStatusLabel(undefined)).toBeNull();
    expect(getClassStatusLabel('')).toBeNull();
  });

  it('maps known statuses to friendly labels', () => {
    expect(getClassStatusLabel('in_progress')).toBe('In Progress');
    expect(getClassStatusLabel('none')).toBe('Not Started');
    expect(getClassStatusLabel('completed')).toBe('Completed');
  });

  it('falls back to the raw value for unknown statuses', () => {
    expect(getClassStatusLabel('mystery')).toBe('mystery');
  });
});

describe('getClassStatusTier', () => {
  it('defaults to info when status is missing or unknown', () => {
    expect(getClassStatusTier(undefined)).toBe('info');
    expect(getClassStatusTier('mystery')).toBe('info');
  });

  it('maps in-progress to the Ring Green live tier (not success), matching the class-list card', () => {
    // DESIGN.md "Ring Green Rule": a live class is Ring Green here too, so the
    // popover "Status:" row agrees with the class-list pill (PR #925 follow-up).
    expect(getClassStatusTier('in_progress')).toBe('live');
    expect(getClassStatusTier('in_progress')).not.toBe('success');
  });

  it('keeps the non-live status mappings intact', () => {
    expect(getClassStatusTier('offline')).toBe('destructive');
    expect(getClassStatusTier('briefing')).toBe('warning');
    expect(getClassStatusTier('setup')).toBe('warning');
    expect(getClassStatusTier('none')).toBe('info');
    expect(getClassStatusTier('break')).toBe('info');
    expect(getClassStatusTier('completed')).toBe('neutral');
  });

  it('renders the live tier through var(--live), never text-success', () => {
    expect(badgeClass(getClassStatusTier('in_progress'))).toContain('var(--live)');
    expect(badgeClass(getClassStatusTier('in_progress'))).not.toContain('text-success');
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
