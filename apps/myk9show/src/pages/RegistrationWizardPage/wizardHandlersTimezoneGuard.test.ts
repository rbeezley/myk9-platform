/**
 * MYK9-642 round 3, N-F6.
 *
 * `handleNext` is the last thing between a not-ready render and the writers.
 * It is belt-and-braces — `canProceed()` is false in the same render — but the
 * braces are what protect the OFFLINE desk path, which writes `entry_fee` and
 * `is_day_of_show` straight through replication with no server to correct
 * them. A rehydrated wizard mounts straight onto Payment (a reload, or a
 * cancelled Stripe checkout) and this handler closes over the zone from the
 * render it was built in, so a stale-but-enabled click has to be refused.
 *
 * `canProceed` is stubbed TRUE throughout, deliberately: this file exists to
 * test the guard on its own, not the button state that usually hides it.
 *
 * Mutation check: delete the `if (!entryWindowTimezoneReady)` block in
 * `wizardHandlers.ts` and both refusal cases go red — `submitPaymentStep` is
 * called.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createWizardHandlers } from './wizardHandlers';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import { submitPaymentStep } from './submitPaymentStep';
import { notifications } from '@/lib/notifications';

vi.mock('./submitPaymentStep', () => ({ submitPaymentStep: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function stateWith(overrides: Record<string, unknown>): RegistrationWizardState {
  return {
    currentStepId: 'payment',
    registrationId: 'registration-1',
    currentRegistration: { id: 'registration-1', status: 'draft' },
    currentShow: { id: 'show-1', preEntryFee: '30', startDate: '2026-11-07T00:00:00+00:00' },
    canProceed: () => true,
    isLastStep: false,
    submittingRef: { current: false },
    mountedRef: { current: true },
    currentStep: 2,
    classSelections: [],
    handlerAssignments: {},
    classes: [],
    registrationData: { selectedDogs: [], paymentMethod: 'check' },
    paymentDetailsRef: { current: {} },
    ownerResolution: { ok: true, ownerId: 'person-1' },
    markStepComplete: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  } as unknown as RegistrationWizardState;
}

describe('handleNext — the show timezone guard (MYK9-642 N-F6)', () => {
  beforeEach(() => {
    vi.mocked(submitPaymentStep).mockClear();
    vi.mocked(notifications.error).mockClear();
  });

  it('refuses to submit while the zone is still being read, and says to wait', async () => {
    const handlers = createWizardHandlers(
      stateWith({ entryWindowTimezoneReady: false, entryWindowTimezoneUnavailable: false })
    );

    await handlers.handleNext();

    expect(submitPaymentStep).not.toHaveBeenCalled();
    const message = vi.mocked(notifications.error).mock.calls[0]?.[0] as string;
    expect(message).toMatch(/still loading/i);
    expect(message).not.toMatch(/could not load/i);
  });

  it('refuses with the FAILED copy, not a wait, when the read is unavailable', async () => {
    const handlers = createWizardHandlers(
      stateWith({ entryWindowTimezoneReady: false, entryWindowTimezoneUnavailable: true })
    );

    await handlers.handleNext();

    expect(submitPaymentStep).not.toHaveBeenCalled();
    const message = vi.mocked(notifications.error).mock.calls[0]?.[0] as string;
    expect(message).toMatch(/could not load/i);
    expect(message).toMatch(/reload/i);
    expect(message).not.toMatch(/still loading/i);
  });

  it('submits once the zone resolves — the positive control', async () => {
    // Without this, both refusals above would pass for a handler that never
    // submits at all.
    const handlers = createWizardHandlers(
      stateWith({ entryWindowTimezoneReady: true, entryWindowTimezoneUnavailable: false })
    );

    await handlers.handleNext();

    expect(submitPaymentStep).toHaveBeenCalledTimes(1);
    expect(notifications.error).not.toHaveBeenCalled();
  });
});
