import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitPaymentStep, type SubmitPaymentStepContext } from './submitPaymentStep';

const submitShowRegistrationMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/registration/submitShowRegistration', () => ({
  submitShowRegistration: submitShowRegistrationMock,
}));

vi.mock('@/features/registration/registrationCartCheckout', () => ({
  submitRegistrationCartCheckout: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
  },
}));

function makeContextAndOrder(overrides: Partial<SubmitPaymentStepContext> = {}): {
  ctx: SubmitPaymentStepContext;
  order: string[];
} {
  const order: string[] = [];

  const base: SubmitPaymentStepContext = {
    showId: 'show-1',
    userId: 'user-1',
    registrationId: 'registration-1',
    previousStatus: 'draft',
    currentWorkflowMode: 'exhibitor',
    paymentMethod: 'check',
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
    currentStep: 2,
    cart: {
      loadCart: vi.fn(),
      clearCart: vi.fn(async () => {
        order.push('clearCart');
        return true;
      }),
      createCart: vi.fn(),
      addItem: vi.fn(),
      abandonCart: vi.fn(),
    },
    submitRegistration: vi.fn(),
    confirmRegistration: vi.fn(),
    isMounted: () => true,
    setIsSubmitting: vi.fn(),
    setRegistrationNumber: vi.fn(),
    setArmbandAssignments: vi.fn(),
    markStepComplete: vi.fn(),
    setCurrentStep: vi.fn(),
    updateShowRegistration: vi.fn(),
    triggerSync: vi.fn(() => {
      order.push('triggerSync');
    }),
    navigate: vi.fn(),
    discardDraftsWithoutFinalSave: vi.fn(),
    clearDraftData: vi.fn(),
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

describe('submitPaymentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitShowRegistrationMock.mockResolvedValue({
      aborted: false,
      registrationNumber: 'REG-1',
      armbandAssignments: [],
      armbandFailures: [],
    });
  });

  it('clears non-card cart lines after submit success and before sync', async () => {
    const { ctx, order } = makeContextAndOrder();

    await submitPaymentStep(ctx);

    expect(submitShowRegistrationMock).toHaveBeenCalledTimes(1);
    expect(ctx.cart.clearCart).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['clearCart', 'triggerSync']);
  });
});
