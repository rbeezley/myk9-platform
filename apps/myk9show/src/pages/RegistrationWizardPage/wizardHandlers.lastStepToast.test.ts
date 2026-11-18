/**
 * MYK9-2159: the last-step toast must not claim "Entry submitted successfully"
 * when the receipt says no entries were added (all waitlisted or all denied).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createWizardHandlers } from './wizardHandlers';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import { notifications } from '@/lib/notifications';

vi.mock('./submitPaymentStep', () => ({ submitPaymentStep: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

type Outcome = { dogId: string; classId: string; outcome: 'created' | 'waitlisted' | 'denied' };

async function finish(entryOutcomes: Outcome[] | undefined) {
  const state = {
    canProceed: () => true,
    isLastStep: true,
    submittingRef: { current: false },
    currentStep: 3,
    showId: 'show-1',
    isLateEntryMode: false,
    entryOutcomes,
    ownerResolution: { ok: true, ownerId: 'person-1' },
    markStepComplete: vi.fn(),
    navigate: vi.fn(),
  } as unknown as RegistrationWizardState;
  await createWizardHandlers(state).handleNext();
}

const outcome = (kind: Outcome['outcome'], n = 1): Outcome => ({
  dogId: `dog-${n}`,
  classId: `class-${n}`,
  outcome: kind,
});

describe('handleNext last step toast (MYK9-2159)', () => {
  beforeEach(() => {
    vi.mocked(notifications.success).mockClear();
    vi.mocked(notifications.info).mockClear();
  });

  it('says no entries were added when every selection was denied', async () => {
    await finish([outcome('denied', 1), outcome('denied', 2)]);
    expect(notifications.success).not.toHaveBeenCalled();
    expect(notifications.info).toHaveBeenCalledWith('No entries were added');
  });

  it('does not claim success when every selection was waitlisted', async () => {
    await finish([outcome('waitlisted')]);
    expect(notifications.success).not.toHaveBeenCalled();
    expect(notifications.info).toHaveBeenCalledWith(
      'No entries were added. The selections joined the waitlist.'
    );
  });

  it('still confirms when at least one entry was created', async () => {
    await finish([outcome('created', 1), outcome('waitlisted', 2)]);
    expect(notifications.success).toHaveBeenCalledWith('Entry submitted successfully');
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('still confirms a normal submission with no surfaced outcomes', async () => {
    await finish(undefined);
    expect(notifications.success).toHaveBeenCalledWith('Entry submitted successfully');
  });
});
