import { describe, expect, it } from 'vitest';
import {
  ENTRY_ATTENTION_FILTER_VALUES,
  getEntryManagementEmptyStateMessage,
  normalizeEntryManagementSearchParams,
} from '../entryManagementFilters';

describe('entryManagementFilters', () => {
  it('maps entryTab=pending to the pending attention filter', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('entryTab=pending'));

    expect(result.attention).toBe('pending');
    expect(result.params.get('attention')).toBe('pending');
    expect(result.params.has('entryTab')).toBe(false);
  });

  it('leaves tab=waitlist untouched (page-level tab, not an attention filter)', () => {
    const result = normalizeEntryManagementSearchParams(new URLSearchParams('tab=waitlist'));

    expect(result.attention).toBe('all');
    expect(result.params.has('attention')).toBe(false);
    expect(result.params.get('tab')).toBe('waitlist');
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

  it('returns filter-aware empty copy for attention filters', () => {
    expect(
      getEntryManagementEmptyStateMessage({
        attention: 'waitlist',
        hasSearch: false,
        payment: 'all',
      })
    ).toBe('No waitlist entries right now.');

    expect(
      getEntryManagementEmptyStateMessage({
        attention: 'pulled',
        hasSearch: false,
        payment: 'all',
      })
    ).toBe('No pulled / no-show entries right now.');
  });

  it('mentions active filters when search or payment narrows the empty result', () => {
    expect(
      getEntryManagementEmptyStateMessage({
        attention: 'all',
        hasSearch: true,
        payment: 'all',
      })
    ).toBe('No entries match these filters.');

    expect(
      getEntryManagementEmptyStateMessage({
        attention: 'pending',
        hasSearch: false,
        payment: 'pending',
      })
    ).toBe('No pending entries match these filters.');
  });
});
