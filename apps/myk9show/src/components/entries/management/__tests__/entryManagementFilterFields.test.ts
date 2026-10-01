import { describe, expect, it, vi } from 'vitest';
import { buildEntryManagementFilterFields } from '../entryManagementFilterFields';
import type { EntryManagementCockpitState } from '../entryManagementCockpitParams';

const BASE_STATE: EntryManagementCockpitState = {
  tab: 'registrations',
  exception: 'move-ups',
  queue: 'needs-review',
  search: '',
  density: 'comfortable',
  trialId: null,
  classId: null,
  paymentStatus: null,
  registrationKey: null,
};

describe('buildEntryManagementFilterFields', () => {
  it('offers every trial as a Trial filter option', () => {
    const fields = buildEntryManagementFilterFields({
      state: BASE_STATE,
      trials: [{ id: 't1', name: 'Trial One', date: null, trial_number: 1 }],
      trialClasses: [],
      onScopeChange: vi.fn(),
    });
    const trialField = fields.find(field => field.key === 'trial');
    expect(trialField?.kind).toBe('options');
    expect(
      trialField && 'options' in trialField ? trialField.options.map(o => o.value) : []
    ).toEqual(['t1']);
  });

  it('has no Payment status field (cut by MYK9-906; the Payment due view covers it)', () => {
    const fields = buildEntryManagementFilterFields({
      state: BASE_STATE,
      trials: [],
      trialClasses: [],
      onScopeChange: vi.fn(),
    });
    expect(fields.map(field => field.key)).toEqual(['trial', 'class']);
  });

  it('routes a class pick through onScopeChange keeping the current trial', () => {
    const onScopeChange = vi.fn();
    const fields = buildEntryManagementFilterFields({
      state: { ...BASE_STATE, trialId: 't1' },
      trials: [],
      trialClasses: [{ id: 'c1', name: 'Novice A' }],
      onScopeChange,
    });
    const classField = fields.find(field => field.key === 'class');
    if (classField?.kind === 'options') classField.onChange('c1');
    expect(onScopeChange).toHaveBeenCalledWith('t1', 'c1');
  });
});
