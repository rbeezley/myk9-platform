import { vi } from 'vitest';
import type { SubmitPaymentStepContext } from './submitPaymentStep';
import { PaymentStatus } from '@/types/show-registration-types';

export function makeContextAndOrder(overrides: Partial<SubmitPaymentStepContext> = {}): {
  ctx: SubmitPaymentStepContext;
  order: string[];
} {
  const order: string[] = [];

  const base: SubmitPaymentStepContext = {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'registration-1',
    previousStatus: 'draft',
    isLateEntryMode: false,
    currentWorkflowMode: 'exhibitor',
    paymentMethod: 'check',
    paymentStatus: PaymentStatus.PENDING,
    paymentDetails: {},
    ownerResolution: { ok: true, ownerId: 'owner-1' },
    exhibitorProfileId: 'profile-1',
    classSelections: [],
    handlerAssignments: {},
    classes: [],
    canAssignArmbands: false,
    showFeeInfo: {
      preEntryFee: '25',
      startDate: '2026-08-01',
    },
    juniorHandlerDogIds: new Set<string>(),
    currentStep: 2,
    cart: {
      clearCart: vi.fn(async () => {
        order.push('clearCart');
        return true;
      }),
      ensureCart: vi.fn(),
      addItem: vi.fn(),
      abandonCart: vi.fn(),
    },
    submitRegistration: vi.fn(),
    isMounted: () => true,
    setIsSubmitting: vi.fn(),
    setRegistrationNumber: vi.fn(),
    setArmbandAssignments: vi.fn(),
    setEntryOutcomes: vi.fn(),
    setCreatedEntryOutcomes: vi.fn(),
    markStepComplete: vi.fn(),
    setCurrentStep: vi.fn(),
    updateShowRegistration: vi.fn(),
    invalidateOwnTodayEntries: vi.fn(),
    triggerSync: vi.fn(() => {
      order.push('triggerSync');
    }),
    navigate: vi.fn(),
    discardDraftsWithoutFinalSave: vi.fn(),
  };

  return {
    ctx: {
      ...base,
      ...overrides,
      cart: {
        ...base.cart,
        ...overrides.cart,
      },
    },
    order,
  };
}
