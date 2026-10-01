/**
 * MYK9-878: a junior-fee submission commits $15 per entry on the server, but the wizard's
 * live total (`liveTotalFees`) only knows the normal $30. The confirmation and the
 * downloaded receipt must total the COMMITTED `fee_cents` from the RPC outcomes, so the
 * outcomes `submitShowRegistration` hands back have to survive when the junior-fee
 * override was used, even though nothing else about the submission is noteworthy.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ConfirmationStep } from '../ConfirmationStep';
import { getCreatedOutcomeTotalFees } from '../entrySubmissionOutcomes';
import { submitShowRegistration } from '@/features/registration/submitShowRegistration';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', name: 'Rover', callName: 'Rover' }] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', name: 'Fall Trial', startDate: '2026-10-10' }] }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    trials: [{ id: 'trial-1', name: 'Saturday Trial', trialDate: '2026-10-10' }],
  }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      { id: 'class-1', trialId: 'trial-1', className: 'Container Novice' },
      { id: 'class-2', trialId: 'trial-1', className: 'Interior Novice' },
    ],
  }),
}));
vi.mock('../RegistrationManagementPanel', () => ({ RegistrationManagementPanel: () => null }));

const classSelections = [
  {
    dogId: 'dog-1',
    trialId: 'trial-1',
    selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
  },
];

/** Two entries, both committed at $15 (the server's junior fee) against a live total of $60. */
function submit(args: { chargeJuniorFee: boolean; committedCents: number }) {
  return submitShowRegistration({
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-reg-1',
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    paymentMethod: 'check',
    paymentDetails: { paymentReference: 'c1', chargeJuniorFee: args.chargeJuniorFee },
    classSelections,
    handlerAssignments: {},
    classes: [
      { id: 'class-1', entryFee: 30 },
      { id: 'class-2', entryFee: 30 },
    ],
    showFeeInfo: { preEntryFee: '30', startDate: '2099-01-01', juniorHandlerFee: '15' },
    submissionSource: 'organizer',
    deps: {
      submitRegistration: vi.fn().mockResolvedValue(undefined),
      createShowRegistration: vi.fn().mockResolvedValue({
        data: { id: 'db-reg', confirmationNumber: 'MK9-1' },
        error: null,
      }),
      submitShowEntries: vi.fn().mockResolvedValue({
        entries: [
          { entryId: 'e1', dogId: 'dog-1' },
          { entryId: 'e2', dogId: 'dog-1' },
        ],
        outcomes: ['class-1', 'class-2'].map((classId, i) => ({
          dogId: 'dog-1',
          classId,
          outcome: 'created',
          entryId: `e${i + 1}`,
          waitlistEntryId: null,
          waitlistPosition: null,
          feeCents: args.committedCents,
          capacityOverride: false,
        })),
        registrationId: 'db-reg',
        submissionId: 's1',
      }),
      claimNextArmband: vi.fn().mockResolvedValue({ armband: '101' }),
      createSubmissionId: () => 's1',
    },
  });
}

describe('junior fee receipts use the committed fee_cents (MYK9-878)', () => {
  it('retains the RPC outcomes when the junior fee override was used', async () => {
    const result = await submit({ chargeJuniorFee: true, committedCents: 1500 });

    if (result.aborted) throw new Error('unexpected abort');
    expect(result.entryOutcomes).toHaveLength(2);
    // The live total the wizard computed would be the normal $60.
    expect(getCreatedOutcomeTotalFees(result.entryOutcomes, 60)).toBe(30);
  });

  it('retains them whenever a committed fee differs from the quote, override or not', async () => {
    // The client quoted $30 per entry; the server committed $12 (e.g. repriced).
    const result = await submit({ chargeJuniorFee: false, committedCents: 1200 });

    if (result.aborted) throw new Error('unexpected abort');
    expect(getCreatedOutcomeTotalFees(result.entryOutcomes, 60)).toBe(24);
  });

  it('does not add an outcome summary to an ordinary submission that matches its quote', async () => {
    const result = await submit({ chargeJuniorFee: false, committedCents: 3000 });

    if (result.aborted) throw new Error('unexpected abort');
    expect(result.entryOutcomes).toBeUndefined();
  });

  it('the confirmation total is the sum of the committed fee_cents, not the live total', async () => {
    const result = await submit({ chargeJuniorFee: true, committedCents: 1500 });
    if (result.aborted) throw new Error('unexpected abort');

    render(
      <ConfirmationStep
        registrationNumber="REG-001"
        selectedDogs={['dog-1']}
        classSelections={classSelections}
        documents={[]}
        paymentMethod="check"
        paymentStatus={PaymentStatus.PENDING}
        entryStatus={EntryStatus.PENDING}
        totalFees={60}
        showId="show-1"
        entryOutcomes={result.entryOutcomes}
      />
    );

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.queryByText('$60.00')).not.toBeInTheDocument();
  });
});
