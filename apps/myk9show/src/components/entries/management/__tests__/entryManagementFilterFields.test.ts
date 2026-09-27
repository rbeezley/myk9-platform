import { describe, expect, it, vi } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
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
      onPaymentStatusChange: vi.fn(),
    });
    const trialField = fields.find(field => field.key === 'trial');
    expect(trialField?.kind).toBe('options');
    expect(
      trialField && 'options' in trialField ? trialField.options.map(o => o.value) : []
    ).toEqual(['t1']);
  });

  it('offers every payment status as an option, replacing TrialClassFilters + adding payment', () => {
    const fields = buildEntryManagementFilterFields({
      state: BASE_STATE,
      trials: [],
      trialClasses: [],
      onScopeChange: vi.fn(),
      onPaymentStatusChange: vi.fn(),
    });
    const paymentField = fields.find(field => field.key === 'payment');
    expect(paymentField?.kind).toBe('options');
    expect(
      paymentField && 'options' in paymentField ? paymentField.options.map(o => o.value) : []
    ).toEqual(Object.values(PaymentStatus));
  });

  it('routes a class pick through onScopeChange keeping the current trial', () => {
    const onScopeChange = vi.fn();
    const fields = buildEntryManagementFilterFields({
      state: { ...BASE_STATE, trialId: 't1' },
      trials: [],
      trialClasses: [{ id: 'c1', name: 'Novice A' }],
      onScopeChange,
      onPaymentStatusChange: vi.fn(),
    });
    const classField = fields.find(field => field.key === 'class');
    if (classField?.kind === 'options') classField.onChange('c1');
    expect(onScopeChange).toHaveBeenCalledWith('t1', 'c1');
  });

  it('routes a payment pick straight through onPaymentStatusChange', () => {
    const onPaymentStatusChange = vi.fn();
    const fields = buildEntryManagementFilterFields({
      state: BASE_STATE,
      trials: [],
      trialClasses: [],
      onScopeChange: vi.fn(),
      onPaymentStatusChange,
    });
    const paymentField = fields.find(field => field.key === 'payment');
    if (paymentField?.kind === 'options') paymentField.onChange(PaymentStatus.WAIVED);
    expect(onPaymentStatusChange).toHaveBeenCalledWith(PaymentStatus.WAIVED);
  });
});
