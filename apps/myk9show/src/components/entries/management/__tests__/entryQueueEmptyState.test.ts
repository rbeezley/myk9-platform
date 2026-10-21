import { describe, expect, it } from 'vitest';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';
import { SHOW_REGISTRATION_QUEUE_LABELS } from '../entryManagementViews';
import { describeEmptyEntryQueue } from '../entryQueueEmptyState';

const base: Pick<EntryManagementCockpitState, 'queues' | 'search'> = {
  queues: ['needs-review'],
  search: '',
};

describe('describeEmptyEntryQueue', () => {
  it('names the count in All when only the checked queue is empty', () => {
    expect(describeEmptyEntryQueue(base, 14, 14)).toEqual({
      heading: 'Nothing needs review',
      body: '14 entry forms are in All. Choose All from the Show menu to see them.',
    });
  });

  it('uses the singular for one form', () => {
    expect(describeEmptyEntryQueue(base, 1, 1).body).toBe(
      '1 entry form is in All. Choose All from the Show menu to see it.'
    );
  });

  it('names another single queue by the menu label, and several as "these queues"', () => {
    expect(describeEmptyEntryQueue({ ...base, queues: ['payment-due'] }, 3, 3).heading).toBe(
      `Nothing in ${SHOW_REGISTRATION_QUEUE_LABELS['payment-due']}`
    );
    expect(
      describeEmptyEntryQueue({ ...base, queues: ['needs-review', 'payment-due'] }, 3, 3).heading
    ).toBe('Nothing in these queues');
  });

  it('keeps the no-entries message for a show with no forms', () => {
    expect(describeEmptyEntryQueue(base, 0, 0).heading).toBe('No entries yet');
  });

  it('says a search emptied the list, whatever else is set', () => {
    expect(describeEmptyEntryQueue({ ...base, search: 'bob' }, 14, 14).body).toBe(
      'No entry forms match this search.'
    );
  });

  it('under a trial or class scope, still names the queue and counts All within the scope', () => {
    expect(describeEmptyEntryQueue(base, 14, 3)).toEqual({
      heading: 'Nothing needs review',
      body: '3 entry forms are in All. Choose All from the Show menu to see them.',
    });
    expect(describeEmptyEntryQueue(base, 14, 0).body).toBe('No entry forms match this filter.');
  });
});
