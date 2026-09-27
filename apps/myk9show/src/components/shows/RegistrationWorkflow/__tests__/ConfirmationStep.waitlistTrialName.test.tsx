/**
 * MYK9-832 #12: the waitlist summary alert listed only the class name, so a
 * dog waitlisted for the identical class ("Vehicle Novice B") in two trials
 * read as the same line twice — "Vehicle Novice B, Vehicle Novice B" — with no
 * trial to tell them apart.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ConfirmationStep } from '../ConfirmationStep';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', name: 'Rover', callName: 'Rover' }] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', name: 'Fall Trial', startDate: '2026-10-10' }] }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    trials: [
      { id: 'trial-1', name: 'Saturday Trial 1', trialDate: '2026-10-10' },
      { id: 'trial-2', name: 'Saturday Trial 2', trialDate: '2026-10-10' },
    ],
  }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      { id: 'class-t1', trialId: 'trial-1', className: 'Vehicle Novice B' },
      { id: 'class-t2', trialId: 'trial-2', className: 'Vehicle Novice B' },
    ],
  }),
}));

// Stub the heavy child panel — it isn't under test here.
vi.mock('../RegistrationManagementPanel', () => ({
  RegistrationManagementPanel: () => null,
}));

const baseProps = {
  registrationNumber: 'REG-001',
  selectedDogs: [] as string[],
  classSelections: [],
  documents: [] as File[],
  paymentMethod: 'check',
  paymentStatus: PaymentStatus.PENDING,
  entryStatus: EntryStatus.PENDING,
  totalFees: 0,
  showId: 'show-1',
};

describe('ConfirmationStep waitlist trial names', () => {
  it('names each trial so two identical waitlisted classes are distinguishable', () => {
    render(
      <ConfirmationStep
        {...baseProps}
        waitlistEntries={[
          {
            id: 'wl-1',
            class_id: 'class-t1',
            dog_id: 'dog-1',
            exhibitor_id: 'ex-1',
            handler_id: null,
            position: 3,
            status: 'waitlisted',
            className: 'Vehicle Novice B',
          },
          {
            id: 'wl-2',
            class_id: 'class-t2',
            dog_id: 'dog-1',
            exhibitor_id: 'ex-1',
            handler_id: null,
            position: 1,
            status: 'waitlisted',
            className: 'Vehicle Novice B',
          },
        ]}
      />
    );

    expect(screen.getByText(/Saturday Trial 1 — Vehicle Novice B #3/)).toBeInTheDocument();
    expect(screen.getByText(/Saturday Trial 2 — Vehicle Novice B #1/)).toBeInTheDocument();
  });
});
