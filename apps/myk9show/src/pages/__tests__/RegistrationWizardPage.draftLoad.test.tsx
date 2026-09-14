import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { SavedDraft } from '@/hooks/useDraftPersistence';

// ─── Mock react-router-dom params ────────────────────────────────────────────
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ showId: 'show-1' }),
    useNavigate: () => vi.fn(),
    useMatch: () => null,
  };
});

// ─── Stores ──────────────────────────────────────────────────────────────────
const mockCreateRegistration = vi.fn(() => ({ id: 'reg-1' }));

vi.mock('@/store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    createRegistration: mockCreateRegistration,
    submitRegistration: vi.fn(),
    currentRegistration: null,
    setDraftData: vi.fn(),
    updateRegistration: vi.fn(),
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 'show-1',
        name: 'Test Show',
        organization: null,
        startDate: '2026-06-01',
        preEntryFee: '0',
      },
    ],
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({
    createMultipleEntries: vi.fn(),
    updateRegistration: vi.fn(),
  }),
}));

// ─── Hooks ───────────────────────────────────────────────────────────────────
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    canCreateExhibitor: false,
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  }),
}));

vi.mock('@/hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => ({ mode: null }),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ triggerSync: vi.fn() }),
}));

const mockProfileState: {
  profile: { id: string; person_id: string } | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
} = {
  profile: { id: 'profile-1', person_id: 'user-1' },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => mockProfileState,
}));

const mockActivateDraft = vi.fn();
vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    activateDraft: mockActivateDraft,
    deactivateDraft: vi.fn(),
  }),
}));

// dogs mock — mutable so individual tests can override
const mockDogStoreState = {
  dogs: [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }],
  isLoading: false,
  isReady: true,
  rosterError: null,
  refetch: vi.fn(),
};
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => mockDogStoreState,
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [] }),
}));

vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRegistrationContext: () => ({ mode: null }),
}));

// ─── Child component mocks ────────────────────────────────────────────────────
let capturedSelectedDogs: string[] = [];
let capturedClassSelections: Array<{
  dogId: string;
  trialId: string;
  selectedClasses: { classId: string }[];
}> = [];
let capturedStepId = '';
let capturedOnDogSelectionChange: ((dogIds: string[]) => void) | null = null;
vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    registrationData: { selectedDogs: string[]; paymentMethod?: string };
    optimisticState: {
      classSelections: typeof capturedClassSelections;
      paymentStatus: PaymentStatus;
    };
    currentStepId: string;
    onDogSelectionChange: (dogIds: string[]) => void;
  }) => {
    capturedSelectedDogs = props.registrationData.selectedDogs;
    capturedClassSelections = props.optimisticState.classSelections;
    capturedStepId = props.currentStepId;
    capturedOnDogSelectionChange = props.onDogSelectionChange;
    return (
      <div
        data-testid="step-content"
        data-payment-method={props.registrationData.paymentMethod}
        data-payment-status={props.optimisticState.paymentStatus}
      />
    );
  },
}));

vi.mock('@/components/shows/wizard/components/HorizontalProgressIndicator', () => ({
  default: () => <div data-testid="progress" />,
}));

vi.mock('@/components/shows/wizard/components/WizardNavigation', () => ({
  default: () => <div data-testid="nav" />,
}));

// DraftManager — capture the onDraftLoaded prop so tests can call it
let capturedOnDraftLoaded: ((draft: SavedDraft) => void) | null = null;
let capturedShowResume = false;
let capturedLoadError = false;
let capturedIdentityPending = false;
vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: (props: {
    onDraftLoaded: (draft: SavedDraft) => void;
    showResume: boolean;
    loadError: boolean;
    identityPending: boolean;
  }) => {
    capturedOnDraftLoaded = props.onDraftLoaded;
    capturedShowResume = props.showResume;
    capturedLoadError = props.loadError;
    capturedIdentityPending = props.identityPending;
    return <div data-testid="draft-manager" />;
  },
}));

vi.mock('@/components/common/ErrorBoundary', () => ({
  RegistrationErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/database/armbands', () => ({
  claimNextArmband: vi.fn(),
}));

// ─── Import page after all mocks ─────────────────────────────────────────────
import RegistrationWizardPage from '../RegistrationWizardPage';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';

function buildDraft(selectedDogs: string[]): SavedDraft {
  return {
    metadata: {
      id: 'draft-1',
      showId: 'show-1',
      userId: 'user-1',
      timestamp: Date.now(),
      stepCompleted: 'class-selection',
      title: 'Draft registration',
      preview: 'Draft registration',
    },
    data: {
      selectedDogs,
      entries: [],
      documents: [],
      paymentMethod: undefined,
      specialRequests: undefined,
      _workflowState: {
        currentStep: 'class-selection',
        stepCompletionState: {},
        classSelections: [],
        handlerAssignments: {},
        paymentStatus: PaymentStatus.PENDING,
        entryStatus: EntryStatus.PENDING,
      },
    },
  };
}

describe('RegistrationWizardPage — handleDraftLoaded', () => {
  beforeEach(() => {
    capturedOnDraftLoaded = null;
    capturedSelectedDogs = [];
    capturedClassSelections = [];
    capturedStepId = '';
    capturedOnDogSelectionChange = null;
    capturedShowResume = false;
    capturedLoadError = false;
    capturedIdentityPending = false;
    mockCreateRegistration.mockClear();
    mockActivateDraft.mockClear();
    mockCreateRegistration.mockReturnValue({ id: 'reg-1' });
    // Default: one dog available (auto-select will fire for exhibitor mode)
    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    mockDogStoreState.isLoading = false;
    mockDogStoreState.isReady = true;
    mockProfileState.error = null;
    mockProfileState.profile = { id: 'profile-1', person_id: 'user-1' };
  });

  it('replaces an in-progress dog selection with the loaded draft selection', async () => {
    mockDogStoreState.dogs = [
      { id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' },
      { id: 'dog-2', ownerId: 'user-1', ownerName: 'Owner' },
    ];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    await waitFor(() => expect(capturedOnDogSelectionChange).not.toBeNull());

    act(() => {
      capturedOnDogSelectionChange!(['dog-1', 'dog-2']);
    });
    await waitFor(() => expect(capturedSelectedDogs).toEqual(['dog-1', 'dog-2']));

    act(() => {
      capturedOnDraftLoaded!(buildDraft(['dog-1']));
    });
    await waitFor(() => expect(capturedSelectedDogs).toEqual(['dog-1']));
    expect(mockActivateDraft).toHaveBeenCalledOnce();
  });

  it('does NOT call createRegistration when draft has no dogs', async () => {
    // No dogs in store — suppresses the auto-select path
    mockDogStoreState.dogs = [];

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());

    mockCreateRegistration.mockClear();
    capturedOnDraftLoaded!(buildDraft([]));

    // Give React a tick
    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it('offers resume only on the empty exhibitor dog step', async () => {
    mockDogStoreState.dogs = [];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    expect(capturedShowResume).toBe(true);

    act(() => capturedOnDogSelectionChange!(['dog-1']));
    await waitFor(() => expect(capturedShowResume).toBe(false));
  });

  it('does not re-offer resume after the exhibitor clears the dog step themselves', async () => {
    mockDogStoreState.dogs = [];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    expect(capturedShowResume).toBe(true);

    act(() => capturedOnDogSelectionChange!(['dog-1']));
    await waitFor(() => expect(capturedShowResume).toBe(false));

    // Removing the dog puts the step back to empty, but the exhibitor emptied
    // it on purpose — the saved entry stays available through Load Draft
    // rather than the panel popping back up under their hands.
    act(() => capturedOnDogSelectionChange!([]));
    await waitFor(() => expect(capturedSelectedDogs).toEqual([]));
    expect(capturedShowResume).toBe(false);
  });

  it('waits for the account instead of blaming the roster when identity is unresolved', async () => {
    mockProfileState.profile = undefined;
    mockDogStoreState.dogs = [];
    mockDogStoreState.isReady = false;
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    expect(capturedIdentityPending).toBe(true);
    expect(capturedLoadError).toBe(false);

    // A profile error IS retryable, so it is not the identity-pending state.
    mockProfileState.error = new Error('profile read failed');
    act(() => capturedOnDogSelectionChange!([]));
    await waitFor(() => expect(capturedIdentityPending).toBe(false));
  });

  it('restores an offline draft and creates registration after the roster returns', async () => {
    mockDogStoreState.dogs = [];
    mockDogStoreState.isReady = false;
    const view = render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());

    const accepted = capturedOnDraftLoaded!(buildDraft(['dog-1']));

    expect(accepted).toBe(true);
    expect(mockActivateDraft).toHaveBeenCalledOnce();
    await waitFor(() => expect(capturedSelectedDogs).toEqual(['dog-1']));
    expect(mockCreateRegistration).not.toHaveBeenCalled();

    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    mockDogStoreState.isReady = true;
    view.rerender(<RegistrationWizardPage />);
    await waitFor(() => expect(mockCreateRegistration).toHaveBeenCalledOnce());
  });

  it('returns an offline-restored draft to dog selection when the roster no longer has its dog', async () => {
    mockDogStoreState.dogs = [];
    mockDogStoreState.isReady = false;
    const view = render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());

    const draft = buildDraft(['dog-1']);
    draft.data.paymentMethod = 'cash';
    draft.data._workflowState!.paymentStatus = PaymentStatus.PAID_BY_CASH;
    act(() => capturedOnDraftLoaded!(draft));
    await waitFor(() => expect(capturedStepId).toBe('class-selection'));

    mockDogStoreState.isReady = true;
    view.rerender(<RegistrationWizardPage />);

    await waitFor(() => expect(capturedStepId).toBe('dog-selection'));
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockActivateDraft).toHaveBeenCalledOnce();
    expect(capturedSelectedDogs).toEqual([]);
    expect(capturedShowResume).toBe(true);
    expect(screen.getByTestId('step-content')).toHaveAttribute(
      'data-payment-method',
      'credit_card'
    );
    expect(screen.getByTestId('step-content')).toHaveAttribute('data-payment-status', 'pending');
  });

  it('keeps a draft whose dog is absent from the loaded roster', async () => {
    mockDogStoreState.dogs = [];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());

    const accepted = capturedOnDraftLoaded!(buildDraft(['dog-1']));

    expect(accepted).toBe(false);
    expect(mockActivateDraft).not.toHaveBeenCalled();
    expect(capturedSelectedDogs).toEqual([]);
  });

  it('restores saved dog, class selection, and step together', async () => {
    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    const draft = buildDraft(['dog-1']);
    draft.data._workflowState!.classSelections = [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ];

    act(() => capturedOnDraftLoaded!(draft));

    await waitFor(() => expect(capturedStepId).toBe('class-selection'));
    expect(capturedSelectedDogs).toEqual(['dog-1']);
    expect(capturedClassSelections).toEqual([
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ]);
  });

  it('keeps Resume available when a background profile refetch fails but dogs are ready', async () => {
    mockDogStoreState.dogs = [];
    mockProfileState.error = new Error('Background profile refresh failed');
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    expect(capturedShowResume).toBe(true);
    expect(capturedLoadError).toBe(false);
  });
});
