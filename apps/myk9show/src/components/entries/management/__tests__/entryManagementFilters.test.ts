import { describe, expect, it } from 'vitest';
import {
  ENTRY_ATTENTION_FILTER_VALUES,
  normalizeEntryManagementSearchParams,
} from '../entryManagementFilters';

describe('entryManagementFilters', () => {
  it('maps entryTab=pending to the pending attention filter', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('entryTab=pending'));

    expect(result.attention).toBe('pending');
    expect(result.params.get('attention')).toBe('pending');
    expect(result.params.has('entryTab')).toBe(false);
  });

  it('maps tab=waitlist to the waitlist attention filter', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('tab=waitlist'));

    expect(result.attention).toBe('waitlist');
    expect(result.params.get('attention')).toBe('waitlist');
    expect(result.params.has('tab')).toBe(false);
  });

  it('keeps table as the default view', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams(''));

    expect(result.view).toBe('table');
  });

  it('only accepts known attention filter values', () => {
    expect(ENTRY_ATTENTION_FILTER_VALUES).toContain('move-ups');
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('attention=bad'));

    expect(result.attention).toBe('all');
    expect(result.params.has('attention')).toBe(false);
  });
});
