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
      'missing_information',
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

  describe('roster invariant (Phase D)', () => {
    it('strips an orphaned ?roster=1 when no trial is selected', () => {
      // Without this, returning to Entries and picking any trial would jump
      // straight into Roster without clicking the explicit toggle.
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('roster=1'));

      expect(result.params.has('roster')).toBe(false);
    });

    it('keeps ?roster=1 while a trial is selected', () => {
      const input = new URLSearchParams('trial=t1&roster=1');
      const result = normalizeEntryManagementSearchParams(input);

      expect(result.params.get('roster')).toBe('1');
      expect(result.params.get('trial')).toBe('t1');
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

  it('keeps payment filtering URL-backed and normalizes invalid values', () => {
    const supported = normalizeEntryManagementSearchParams(
      new URLSearchParams('trial=t1&class=c1&payment=pending')
    );
    expect(supported.payment).toBe('pending');
    expect(supported.params.toString()).toBe('trial=t1&class=c1&payment=pending');

    const cleared = normalizeEntryManagementSearchParams(
      new URLSearchParams('trial=t1&class=c1&payment=all')
    );
    expect(cleared.payment).toBe('all');
    expect(cleared.params.toString()).toBe('trial=t1&class=c1');

    const invalid = normalizeEntryManagementSearchParams(
      new URLSearchParams('trial=t1&class=c1&payment=surprise')
    );
    expect(invalid.payment).toBe('all');
    expect(invalid.params.toString()).toBe('trial=t1&class=c1');
  });

  // Task 2.2 — normalized URL round-trip + invalid-parameter coverage across
  // every field the normalizer owns (show is a route param, not a query
  // param, so its "round trip" is trial/class/roster clearing on show change,
  // covered by useEntryManagementFilters.test.ts).
  describe('mode round-trip and invalid values', () => {
    it('preserves a supported ?mode=day-of', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('mode=day-of'));
      expect(result.mode).toBe('day-of');
      expect(result.params.get('mode')).toBe('day-of');
    });

    it('normalizes an invalid ?mode= to the review default and drops the param', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('mode=bogus'));
      expect(result.mode).toBe('review');
      expect(result.params.has('mode')).toBe(false);
    });

    it('drops the default ?mode=review from the URL (round-trips to no param)', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('mode=review'));
      expect(result.mode).toBe('review');
      expect(result.params.has('mode')).toBe(false);
    });
  });

  describe('view round-trip and invalid values', () => {
    it('preserves a supported ?view=cards', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('view=cards'));
      expect(result.view).toBe('cards');
      expect(result.params.get('view')).toBe('cards');
    });

    it('normalizes an invalid ?view= to the table default and drops the param', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('view=bogus'));
      expect(result.view).toBe('table');
      expect(result.params.has('view')).toBe(false);
    });
  });

  describe('trial/class scope pass-through', () => {
    it('leaves opaque trial/class ids untouched — validity is the surface caller\'s job', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('trial=t1&class=c1'));
      expect(result.params.get('trial')).toBe('t1');
      expect(result.params.get('class')).toBe('c1');
    });
  });

  it('round-trips a fully populated URL idempotently (normalize(normalize(x)) === normalize(x))', () => {
    const input = new URLSearchParams(
      'trial=t1&class=c1&payment=pending&attention=accepted&mode=day-of&view=cards&roster=1'
    );
    const once = normalizeEntryManagementSearchParams(input);
    const twice = normalizeEntryManagementSearchParams(once.params);

    expect(twice.params.toString()).toBe(once.params.toString());
    expect(twice.attention).toBe(once.attention);
    expect(twice.payment).toBe(once.payment);
    expect(twice.mode).toBe(once.mode);
    expect(twice.view).toBe(once.view);
  });

  it('rejects invalid attention/payment/mode/view together and drops all four from the URL', () => {
    const result = normalizeEntryManagementSearchParams(
      new URLSearchParams('attention=nope&payment=nope&mode=nope&view=nope')
    );
    expect(result.attention).toBe('all');
    expect(result.payment).toBe('all');
    expect(result.mode).toBe('review');
    expect(result.view).toBe('table');
    expect(result.params.toString()).toBe('');
  });

  // Task 3.2 — display-preset density round-trip + invalid-value fallback.
  describe('density round-trip and invalid values', () => {
    it('defaults density to comfortable and drops it from the URL', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams(''));
      expect(result.density).toBe('comfortable');
      expect(result.params.has('density')).toBe(false);
    });

    it('preserves a supported ?density=compact', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('density=compact'));
      expect(result.density).toBe('compact');
      expect(result.params.get('density')).toBe('compact');
    });

    it('normalizes an invalid ?density= to the comfortable default and drops the param', () => {
      const result = normalizeEntryManagementSearchParams(new URLSearchParams('density=roomy'));
      expect(result.density).toBe('comfortable');
      expect(result.params.has('density')).toBe(false);
    });

    it('round-trips idempotently alongside other filters', () => {
      const input = new URLSearchParams('attention=accepted&density=compact');
      const once = normalizeEntryManagementSearchParams(input);
      const twice = normalizeEntryManagementSearchParams(once.params);
      expect(twice.params.toString()).toBe(once.params.toString());
      expect(twice.density).toBe('compact');
    });
  });
});
