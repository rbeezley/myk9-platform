import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { DraftMetadata, SavedDraft } from '@/hooks/useDraftPersistence';

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

const mockActivateDraft = vi.fn();
const mockDeleteDraft = vi.fn();
let mockAvailableDrafts: DraftMetadata[] = [];
vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    activateDraft: mockActivateDraft,
    deleteDraft: mockDeleteDraft,
    availableDrafts: mockAvailableDrafts,
  }),
}));

// dogs mock — mutable so individual tests can override
const mockDogStoreState = {
  dogs: [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }],
  isLoading: false,
  isReady: true,
  error: null,
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
let capturedOnDogSelectionChange: ((dogIds: string[]) => void) | null = null;
vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    registrationData: { selectedDogs: string[] };
    onDogSelectionChange: (dogIds: string[]) => void;
  }) => {
    capturedSelectedDogs = props.registrationData.selectedDogs;
    capturedOnDogSelectionChange = props.onDogSelectionChange;
    return <div data-testid="step-content" />;
  },
}));

let progressOnStepClick: ((step: number) => void) | undefined;
vi.mock('@/components/shows/wizard/components/HorizontalProgressIndicator', () => ({
  default: (props: { onStepClick?: (step: number) => void }) => {
    progressOnStepClick = props.onStepClick;
    return <div data-testid="progress" />;
  },
}));

vi.mock('@/components/shows/wizard/components/WizardNavigation', () => ({
  default: () => <div data-testid="nav" />,
}));

// DraftManager — capture the onDraftLoaded prop so tests can call it
let capturedOnDraftLoaded: ((draft: SavedDraft) => void) | null = null;
vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: (props: { onDraftLoaded: (draft: SavedDraft) => void }) => {
    capturedOnDraftLoaded = props.onDraftLoaded;
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

function buildDraft(selectedDogs: string[], step = 'class-selection'): SavedDraft {
  return {
    metadata: {
      id: 'draft-1',
      showId: 'show-1',
      userId: 'user-1',
      timestamp: Date.now(),
      stepCompleted: step,
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
        currentStep: step,
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
    capturedOnDogSelectionChange = null;
    progressOnStepClick = undefined;
    mockCreateRegistration.mockClear();
    mockActivateDraft.mockClear();
    mockDeleteDraft.mockClear();
    mockAvailableDrafts = [];
    mockCreateRegistration.mockReturnValue({ id: 'reg-1' });
    // Default: one dog available (auto-select will fire for exhibitor mode)
    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    mockDogStoreState.isLoading = false;
    mockDogStoreState.isReady = true;
    mockDogStoreState.error = null;
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
    expect(mockActivateDraft).toHaveBeenCalledTimes(1);
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

  it('does not re-offer resume after an exhibitor edits the dog selection', async () => {
    mockAvailableDrafts = [buildDraft(['dog-1']).metadata];
    mockAvailableDrafts[0] = { ...mockAvailableDrafts[0]!, selectedDogsCount: 1 };
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Resume entry' })).toBeInTheDocument()
    );
    act(() => capturedOnDogSelectionChange!(['dog-1']));
    act(() => capturedOnDogSelectionChange!([]));
    expect(screen.queryByRole('button', { name: 'Resume entry' })).not.toBeInTheDocument();
  });

  it('does not restore a draft while dogs are still loading', async () => {
    mockDogStoreState.dogs = [];
    mockDogStoreState.isLoading = true;
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    act(() => capturedOnDraftLoaded!(buildDraft(['dog-1'])));
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(capturedSelectedDogs).toEqual([]);
    expect(mockActivateDraft).not.toHaveBeenCalled();
  });

  it('does not treat a disabled or failed dog query as a deleted dog', async () => {
    mockDogStoreState.dogs = [];
    mockDogStoreState.isLoading = false;
    mockDogStoreState.isReady = false;
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    act(() => capturedOnDraftLoaded!(buildDraft(['dog-1'])));
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockActivateDraft).not.toHaveBeenCalled();
  });

  it('rejects a draft containing a dog no longer in the store', async () => {
    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    mockCreateRegistration.mockClear();
    act(() => capturedOnDraftLoaded!(buildDraft(['dog-1', 'dog-deleted'])));
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(capturedSelectedDogs).not.toContain('dog-deleted');
    expect(mockActivateDraft).not.toHaveBeenCalled();
  });

  it('refuses to restore a completed draft into a dead-end receipt', async () => {
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });
    await waitFor(() => expect(capturedOnDraftLoaded).not.toBeNull());
    expect(progressOnStepClick).toBeTypeOf('function');

    act(() => capturedOnDraftLoaded!(buildDraft(['dog-1'], 'confirmation')));
    expect(progressOnStepClick).toBeTypeOf('function');
    expect(mockActivateDraft).not.toHaveBeenCalled();
    expect(mockDeleteDraft).toHaveBeenCalledWith('draft-1');
  });
});
