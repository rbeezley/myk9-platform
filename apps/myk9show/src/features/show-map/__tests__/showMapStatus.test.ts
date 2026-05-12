import { describe, expect, it } from 'vitest';
import {
  classifyEntryCheckInStatus,
  classifyEntryRunStatus,
  hasEntryAttention,
} from '../showMapStatus';

describe('showMapStatus', () => {
  it('keeps check-in and run status independent', () => {
    const entry = {
      id: 'entry-1',
      entry_status: 'accepted',
      check_in_status: 'checked-in',
    };

    expect(classifyEntryRunStatus(entry)?.label).toBe('Pending');
    expect(classifyEntryCheckInStatus(entry)?.label).toBe('Checked in');
  });

  it('prefers attention over other entry states', () => {
    const entry = {
      id: 'entry-1',
      entry_status: 'accepted',
      check_in_status: 'conflict',
      is_scored: true,
    };

    expect(classifyEntryRunStatus(entry)?.label).toBe('Needs attention');
    expect(hasEntryAttention(entry)).toBe(true);
  });

  it.each([
    [
      'conflict beats scored completion',
      { entry_status: 'accepted', check_in_status: 'conflict', is_scored: true },
      'Needs attention',
    ],
    [
      'scratch beats scored completion',
      { entry_status: 'scratch', check_in_status: 'completed', is_scored: true },
      'Scratch',
    ],
    [
      'completed beats in-ring timing',
      { entry_status: 'accepted', check_in_status: 'in-ring', is_scored: true },
      'Complete',
    ],
  ])('applies precedence: %s', (_name, entry, expectedLabel) => {
    expect(classifyEntryRunStatus(entry)?.label).toBe(expectedLabel);
  });

  it('maps backed check-in gate states', () => {
    expect(classifyEntryCheckInStatus({ check_in_status: 'come-to-gate' })?.label).toBe(
      'Called to gate'
    );
    expect(classifyEntryCheckInStatus({ check_in_status: 'at-gate' })?.label).toBe('At gate');
    expect(classifyEntryCheckInStatus({ check_in_status: 'pulled' })?.label).toBe('No-show');
  });

  it('hides unknown statuses instead of guessing', () => {
    expect(classifyEntryCheckInStatus({ check_in_status: 'mystery' })).toBeUndefined();
    expect(classifyEntryRunStatus({ entry_status: 'mystery' })).toBeUndefined();
  });
});
