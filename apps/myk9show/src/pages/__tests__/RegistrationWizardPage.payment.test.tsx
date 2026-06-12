import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { StepId } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentMethod,
} from '@/types/show-registration-types';

const navigateMock = vi.hoisted(() => vi.fn());
const submitShowRegistrationMock = vi.hoisted(() => vi.fn());
const submitRegistrationCartCheckoutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const deleteDraftMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const createRegistrationMock = vi.hoisted(() => vi.fn(() => ({ id: 'reg-1' })));
const clearDraftDataMock = vi.hoisted(() => vi.fn());
const discardDraftsWithoutFinalSaveMock = vi.hoisted(() => vi.fn());
const cartActionsMock = vi.hoisted(() => ({
  loadCart: vi.fn(),
  clearCart: vi.fn(),
  createCart: vi.fn(),
  addItem: vi.fn(),
  abandonCart: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ showId: 'show-1' }),
    useNavigate: () => navigateMock,
    useMatch: () => null,
  };
});

vi.mock('@/features/registration/submitShowRegistration', () => ({
  submitShowRegistration: submitShowRegistrationMock,
}));

vi.mock('@/features/registration/registrationCartCheckout', () => ({
  submitRegistrationCartCheckout: submitRegistrationCartCheckoutMock,
}));

vi.mock('@/store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    createRegistration: createRegistrationMock,
    submitRegistration: vi.fn(),
    confirmRegistration: vi.fn(),
    currentRegistration: { id: 'reg-1', status: 'draft', registrationNumber: 'REG-1' },
    setDraftData: vi.fn(),
    clearDraftData: clearDraftDataMock,
    updateRegistration: vi.fn(),
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
    getRegistration: vi.fn(() => ({ id: 'reg-1', handlerId: 'owner-1' })),
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 'show-1',
        name: 'Test Show',
        organization: null,
        startDate: '2099-06-01',
        preEntryFee: '25',
      },
    ],
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({
    updateRegistration: vi.fn(),
  }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: typeof cartActionsMock) => unknown) => selector(cartActionsMock),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    canAssignArmbands: false,
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  }),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ triggerSync: vi.fn() }),
}));

vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    deleteDraft: deleteDraftMock,
    availableDrafts: [],
    clearAllDrafts: vi.fn(),
    discardDraftsWithoutFinalSave: discardDraftsWithoutFinalSaveMock,
    hasUnsavedChanges: false,
  }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [{ id: 'dog-1', ownerId: 'owner-1', ownerName: 'Pat Owner', name: 'Rover' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [{ id: 'class-1', entryFee: 20 }] }),
}));

vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    currentStepId: StepId;
    onClassSelectionChange: (selections: ClassSelectionData[]) => void;
    onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
    onPaymentMethodChange: (method: PaymentMethod) => void;
  }) => {
    React.useEffect(() => {
      if (props.currentStepId === 'class-selection') {
        props.onClassSelectionChange([
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }],
          },
        ]);
        props.onHandlerAssignmentChange({
          'dog-1|class-1': { handlerId: 'owner-1', handlerName: 'Pat Owner' },
        });
      }
      if (props.currentStepId === 'payment') {
        props.onPaymentMethodChange('credit_card');
      }
      // State is emitted once per step transition; including callback props here
      // re-triggers the mocked child on every parent render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.currentStepId]);

    return <div data-testid="step-content">{props.currentStepId}</div>;
  },
}));

vi.mock('@/components/shows/wizard/components/VerticalProgressIndicator', () => ({
  default: () => <div data-testid="progress" />,
}));

vi.mock('@/components/shows/wizard/components/WizardNavigation', () => ({
  default: (props: { canGoNext: boolean; onNext: () => void; isLoading?: boolean }) => (
    <button type="button" disabled={!props.canGoNext || props.isLoading} onClick={props.onNext}>
      Next
    </button>
  ),
}));

vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
}));

vi.mock('@/components/common/ErrorBoundary', () => ({
  RegistrationErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/database/armbands', () => ({
  claimNextArmband: vi.fn(),
  getEntryArmbandById: vi.fn(),
}));

import RegistrationWizardPage from '../RegistrationWizardPage';

describe('RegistrationWizardPage — Stripe payment handoff', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    submitShowRegistrationMock.mockReset();
    submitRegistrationCartCheckoutMock.mockClear();
    deleteDraftMock.mockClear();
    createRegistrationMock.mockClear();
    clearDraftDataMock.mockClear();
    discardDraftsWithoutFinalSaveMock.mockClear();
  });

  it('hands credit-card payment to the cart checkout flow instead of submitShowRegistration', async () => {
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection'));
    await waitFor(() => expect(createRegistrationMock).toHaveBeenCalledWith('show-1', 'user-1', 'owner-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('payment'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(submitRegistrationCartCheckoutMock).toHaveBeenCalledTimes(1));
    expect(submitShowRegistrationMock).not.toHaveBeenCalled();
  });

  it('discards wizard drafts without allowing final auto-save during Stripe handoff', async () => {
    const { user } = render(<RegistrationWizardPage />, {
      initialRoute: '/shows/show-1/register',
    });

    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('class-selection'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByTestId('step-content')).toHaveTextContent('payment'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(submitRegistrationCartCheckoutMock).toHaveBeenCalledTimes(1));
    const [{ deps }] = submitRegistrationCartCheckoutMock.mock.calls[0] as Array<{
      deps: { deleteDraft: () => Promise<void> };
    }>;

    await deps.deleteDraft();

    expect(discardDraftsWithoutFinalSaveMock).toHaveBeenCalledTimes(1);
    expect(clearDraftDataMock).toHaveBeenCalledTimes(1);
    expect(deleteDraftMock).not.toHaveBeenCalled();
  });
});
