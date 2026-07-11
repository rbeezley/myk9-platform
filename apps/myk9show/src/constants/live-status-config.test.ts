import { describe, expect, it } from 'vitest';
import {
  CLASS_STATUS_CONFIG,
  ENTRY_STATUS_BADGE,
  ENTRY_STATUS_BORDER,
} from './live-status-config';

describe('live status semantic colors', () => {
  it('uses shared semantic tokens for entry state badges and borders', () => {
    expect(ENTRY_STATUS_BADGE.checked_in).toBe('bg-success/10 text-success');
    expect(ENTRY_STATUS_BADGE.at_gate).toBe('bg-warning/10 text-warning');
    expect(ENTRY_STATUS_BADGE.pulled).toBe('bg-destructive/10 text-destructive');
    expect(ENTRY_STATUS_BORDER.checked_in).toBe('border-l-success');
    expect(ENTRY_STATUS_BORDER.not_checked_in).toBe('border-l-muted-foreground');
    expect(ENTRY_STATUS_BORDER.at_gate).toBe('border-l-warning');
    expect(ENTRY_STATUS_BORDER.pulled).toBe('border-l-destructive');
  });

  it('uses shared semantic tokens for active and paused class states', () => {
    expect(CLASS_STATUS_CONFIG.in_progress.style).toBe(
      'bg-success/10 text-success animate-pulse'
    );
    expect(CLASS_STATUS_CONFIG.paused.style).toBe('bg-warning/10 text-warning');
  });
});
