import { describe, expect, it } from 'vitest';
import {
  ENTRY_ATTENTION_FILTER_VALUES,
  EXCEPTION_QUEUE_VALUES,
  getEntryManagementEmptyStateMessage,
  isExceptionQueue,
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
    // Phase C: move-ups / pulled are no longer attention filters — they moved to
    // the Exceptions tab. They must NOT appear as status filter values.
    expect(ENTRY_ATTENTION_FILTER_VALUES).not.toContain('move-ups');
    expect(ENTRY_ATTENTION_FILTER_VALUES).not.toContain('pulled');
    expect([...ENTRY_ATTENTION_FILTER_VALUES]).toEqual([
      'all',
      'pending',
      'accepted',
      'waitlist',
      'issues',
    ]);
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
        attention: 'issues',
        hasSearch: false,
        payment: 'all',
      })
    ).toBe('No entries have issues right now.');
  });

  describe('legacy move-ups / pulled URL migration to the Exceptions tab', () => {
    it('isExceptionQueue recognizes the two queues and rejects others', () => {
      expect([...EXCEPTION_QUEUE_VALUES]).toEqual(['move-ups', 'pulled']);
      expect(isExceptionQueue('move-ups')).toBe(true);
      expect(isExceptionQueue('pulled')).toBe(true);
      expect(isExceptionQueue('pending')).toBe(false);
      expect(isExceptionQueue(null)).toBe(false);
    });

    it('migrates ?attention=move-ups to the Exceptions tab (default queue, no queue param)', () => {
      const result = normalizeEntryManagementSearchParams(
        new URLSearchParams('attention=move-ups')
      );

      expect(result.params.get('tab')).toBe('exceptions');
      expect(result.params.has('queue')).toBe(false); // move-ups is the default
      expect(result.params.has('attention')).toBe(false);
      expect(result.attention).toBe('all');
    });

    it('migrates ?attention=pulled to the Exceptions tab with queue=pulled', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('attention=pulled'));

      expect(result.params.get('tab')).toBe('exceptions');
      expect(result.params.get('queue')).toBe('pulled');
      expect(result.params.has('attention')).toBe(false);
    });

    it('migrates the oldest entryTab=scratches link to queue=pulled', () => {
      const result = normalizeEntryManagementSearchParams(
        new URLSearchParams('entryTab=scratches')
      );

      expect(result.params.get('tab')).toBe('exceptions');
      expect(result.params.get('queue')).toBe('pulled');
      expect(result.params.has('entryTab')).toBe(false);
    });

    it('drops a stale trial/class drill-down when migrating a legacy exceptions link', () => {
      const result = normalizeEntryManagementSearchParams(
        new URLSearchParams('attention=move-ups&trial=t1&class=c1')
      );

      expect(result.params.get('tab')).toBe('exceptions');
      expect(result.params.has('trial')).toBe(false);
      expect(result.params.has('class')).toBe(false);
    });

    it('leaves an already-migrated ?tab=exceptions&queue=pulled URL unchanged (idempotent)', () => {
      const input = new URLSearchParams('tab=exceptions&queue=pulled');
      const result = normalizeEntryManagementSearchParams(input);

      expect(result.params.toString()).toBe(input.toString());
    });
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
