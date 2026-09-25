/**
 * MYK9-486 — exhibitor + non-card submit, end to end through the real writer.
 *
 * Only the Supabase transport is mocked. `submitPaymentStep`,
 * `submitShowRegistration`, `createShowRegistration` and
 * `updateExistingEnrollmentPayment` all run for real, so the assertions below
 * are about the statement that actually reaches PostgREST.
 *
 * The bug: the self-service submit path issued
 *   UPDATE public.enrollments SET payment_status = 'pending', payment_method = 'check', …
 *   WHERE id = <enrollment>
 * which `trg_restrict_payment_status` (BEFORE UPDATE on public.enrollments)
 * rejects for anyone who is not service_role / platform admin / secretary —
 * but only once the enrollment's current status differs from 'pending', which
 * is every add-on entry onto an enrollment a secretary already marked paid.
 *
 * The exhibitor may declare a METHOD; only staff may declare a STATUS.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import { submitPaymentStep, type SubmitPaymentStepContext } from './submitPaymentStep';
import { PaymentStatus } from '@/types/show-registration-types';
import { getEffectivePaymentMethod } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';

const fromMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const notificationErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
  logQuery: vi.fn(),
  createDatabaseError,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: notificationErrorMock, success: vi.fn(), warning: vi.fn() },
}));

// Never exercised here (non-card path), but imported by submitPaymentStep.
vi.mock('@/features/registration/registrationCartCheckout', () => ({
  submitRegistrationCartCheckout: vi.fn(),
}));
vi.mock('@/features/registration/submitOfflineLateEntry', () => ({
  submitOfflineLateEntry: vi.fn(),
}));

interface EnrollmentRow {
  id: string;
  confirmation_number: string;
  show_id: string;
  handler_id: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  check_number: string | null;
  payment_date: string | null;
  group_reference: string | null;
  payment_notes: string | null;
  notes: string | null;
  total_amount: number | null;
  paid_amount: number;
  created_at: string;
  updated_at: string;
}

function makeEnrollmentRow(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: 'enrollment-1',
    confirmation_number: 'MK9-000070',
    show_id: 'show-1',
    handler_id: 'owner-1',
    payment_status: PaymentStatus.PENDING,
    payment_method: 'online',
    payment_reference: null,
    check_number: null,
    payment_date: null,
    group_reference: null,
    payment_notes: null,
    notes: null,
    total_amount: null,
    paid_amount: 0,
    created_at: '2026-09-09T20:53:36.294Z',
    updated_at: '2026-09-09T20:53:36.294Z',
    ...overrides,
  };
}

/** Records every payload the enrollments table is asked to write. */
function installTransport(existing: EnrollmentRow) {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  let row = existing;

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    single: vi.fn(async () => ({ data: row, error: null })),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      row = { ...row, ...payload } as EnrollmentRow;
      return chain;
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserts.push(payload);
      return chain;
    }),
  };

  fromMock.mockImplementation(() => chain);
  rpcMock.mockResolvedValue({
    data: {
      entries: [{ entry_id: 'entry-1', dog_id: 'dog-1' }],
      outcomes: [
        {
          dog_id: 'dog-1',
          class_id: 'class-1',
          outcome: 'created',
          entry_id: 'entry-1',
          waitlist_entry_id: null,
          waitlist_position: null,
          fee_cents: 2500,
          capacity_override: false,
          denial_reason: null,
        },
      ],
      registration_id: 'enrollment-1',
      submission_id: 'submission-1',
    },
    error: null,
  });

  return { updates, inserts };
}

function makeContext(overrides: Partial<SubmitPaymentStepContext> = {}): SubmitPaymentStepContext {
  return {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'local-registration-1',
    previousStatus: 'draft',
    isLateEntryMode: false,
    currentWorkflowMode: 'exhibitor',
    paymentMethod: 'check',
    paymentStatus: PaymentStatus.PENDING,
    paymentDetails: {},
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    exhibitorProfileId: 'profile-1',
    classSelections: [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
      },
    ],
    handlerAssignments: {
      'dog-1|class-1': { handlerId: 'owner-1', handlerName: 'Pat Handler', isOwner: true },
    },
    classes: [{ id: 'class-1', entryFee: 25 }],
    canAssignArmbands: false,
    showFeeInfo: { preEntryFee: '25', startDate: '2099-08-01' },
    currentStep: 2,
    cart: {
      clearCart: vi.fn(async () => true),
      ensureCart: vi.fn(),
      addItem: vi.fn(),
      abandonCart: vi.fn(),
    },
    submitRegistration: vi.fn(async () => {}),
    isMounted: () => true,
    setIsSubmitting: vi.fn(),
    setRegistrationNumber: vi.fn(),
    setArmbandAssignments: vi.fn(),
    setEntryOutcomes: vi.fn(),
    markStepComplete: vi.fn(),
    setCurrentStep: vi.fn(),
    updateShowRegistration: vi.fn(),
    triggerSync: vi.fn(),
    navigate: vi.fn(),
    discardDraftsWithoutFinalSave: vi.fn(),
    ...overrides,
  };
}

describe('MYK9-486 — exhibitor non-card submit never writes enrollments.payment_status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits payment_status (and paid_amount) from every enrollments write, recording the method instead', async () => {
    const { updates } = installTransport(makeEnrollmentRow());
    const ctx = makeContext();

    await submitPaymentStep(ctx);

    expect(notificationErrorMock).not.toHaveBeenCalled();
    expect(updates.length).toBeGreaterThan(0);
    for (const payload of updates) {
      expect(payload).not.toHaveProperty('payment_status');
      expect(payload).not.toHaveProperty('paid_amount');
    }
    // The declared intent is recorded as a METHOD, which the trigger allows.
    expect(updates.at(-1)).toEqual({ payment_method: 'check', total_amount: 2500 });
    expect(ctx.markStepComplete).toHaveBeenCalledWith(2);
  });

  it('completes an add-on onto an already-paid enrollment instead of downgrading it (the reported repro)', async () => {
    // Live repro state: enrollment dededede-…-070 for exhibitor@myk9t.com sits at
    // payment_status='paid', so the old 'pending' write was DISTINCT and the
    // trigger raised. It must not be rewritten — nor mislabelled as check-paid.
    const { updates } = installTransport(
      makeEnrollmentRow({ payment_status: 'paid', payment_method: 'online', total_amount: 9630 })
    );
    const ctx = makeContext();

    await submitPaymentStep(ctx);

    expect(notificationErrorMock).not.toHaveBeenCalled();
    for (const payload of updates) {
      expect(payload).not.toHaveProperty('payment_status');
      expect(payload).not.toHaveProperty('payment_method');
    }
    expect(updates.at(-1)).toEqual({ total_amount: 9630 + 2500 });
    expect(ctx.markStepComplete).toHaveBeenCalledWith(2);
  });

  it('leaves a secretary-recorded payment reference alone rather than nulling it', async () => {
    const { updates } = installTransport(
      makeEnrollmentRow({ payment_reference: 'check-100', check_number: '100' })
    );

    await submitPaymentStep(makeContext());

    for (const payload of updates) {
      expect(payload).not.toHaveProperty('payment_reference');
      expect(payload).not.toHaveProperty('check_number');
    }
  });

  it('records the chosen method on each entry through the definer RPC', async () => {
    installTransport(makeEnrollmentRow());

    await submitPaymentStep(makeContext());

    expect(rpcMock).toHaveBeenCalledWith(
      'submit_show_entries',
      expect.objectContaining({
        p_payment_method: 'check',
        p_entries: [expect.objectContaining({ payment_method: 'check' })],
      })
    );
  });

  it('completes for a club with no Stripe account, where check is the only offered method', async () => {
    // MYK9-386 guard: with no club Stripe account the wizard rewrites a card
    // pick to check before Submit. That rewritten method must then go through.
    const effective = getEffectivePaymentMethod({
      paymentMethod: 'credit_card',
      acceptedMethods: { check: true, cash: true },
      cardCheckoutAvailable: false,
    });
    expect(effective).toBe('check');

    const { updates } = installTransport(makeEnrollmentRow());
    const ctx = makeContext({ paymentMethod: 'check' });

    await submitPaymentStep(ctx);

    expect(notificationErrorMock).not.toHaveBeenCalled();
    for (const payload of updates) {
      expect(payload).not.toHaveProperty('payment_status');
    }
    expect(ctx.markStepComplete).toHaveBeenCalledWith(2);
  });

  it('still writes payment_status for the organizer (staff) path', async () => {
    const { updates } = installTransport(makeEnrollmentRow());
    const ctx = makeContext({
      currentWorkflowMode: 'secretary_new',
      paymentMethod: 'secretary_paid',
      // MYK9-677: money received names its method.
      paymentDetails: { receivedMethod: 'cash', paymentDate: '2026-07-07' },
    });

    await submitPaymentStep(ctx);

    expect(notificationErrorMock).not.toHaveBeenCalled();
    expect(updates.some(payload => 'payment_status' in payload)).toBe(true);
    // ...and the money itself goes through the payments ledger, as cash.
    expect(rpcMock).toHaveBeenCalledWith('record_enrollment_payment', {
      p_enrollment_id: 'enrollment-1',
      p_kind: 'payment',
      p_amount: 25,
      p_method: 'cash',
      p_received_on: '2026-07-07',
      p_reference: null,
    });
  });
});
