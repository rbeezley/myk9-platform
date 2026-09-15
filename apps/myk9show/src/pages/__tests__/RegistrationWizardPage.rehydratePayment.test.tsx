/**
 * MYK9-514 AC #1b — a reload ON THE PAYMENT STEP comes back to the payment
 * step, with the payment method the exhibitor had already chosen.
 *
 * This is the state that made MYK9-509 a money problem rather than an
 * annoyance: the exhibitor is one click from paying, the cart holds the fees,
 * and before the fix the reload dropped them on "Select dogs" with
 * `paymentMethod` gone. Nothing here clicks Load Draft — the restore has to
 * happen on mount, from the same-tab marker alone, which is what a reload is.
 *
 * Sibling to `RegistrationWizardPage.draftLoad.test.tsx`, which drives
 * `onDraftLoaded` by hand and therefore cannot see the mount-time path.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

// The read side the rehydration hook needs: the draft list the wizard sees on
// its very first render (localStorage is read synchronously there) and the
// loader it calls. `RegistrationWizardPage.draftLoad.test.tsx` mocks only the
// write side because it drives `onDraftLoaded` by hand; this file is about the
// wizard restoring WITHOUT anyone touching Load Draft.
const mockActivateDraft = vi.fn();
const mockDraftState: { availableDrafts: unknown[]; saved: SavedDraft | null } = {
  availableDrafts: [],
  saved: null,
};
vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    activateDraft: mockActivateDraft,
    deactivateDraft: vi.fn(),
    saveDraft: vi.fn(),
    loadDraft: vi.fn(() => mockDraftState.saved),
    deleteDraft: vi.fn(),
    availableDrafts: mockDraftState.availableDrafts,
    clearAllDrafts: vi.fn(),
    discardDraftsWithoutFinalSave: vi.fn(),
    hasUnsavedChanges: false,
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
let capturedStepId = '';
vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    registrationData: { selectedDogs: string[]; paymentMethod?: string };
    optimisticState: { paymentStatus: PaymentStatus };
    currentStepId: string;
  }) => {
    capturedSelectedDogs = props.registrationData.selectedDogs;
    capturedStepId = props.currentStepId;
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

// DraftManager renders nothing here: this file is about the mount-time restore,
// which happens whether or not the panel is on screen.
vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
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
import { markWizardSessionOpen, wizardSessionKey } from '@/hooks/wizardDraftSession';

const SHOW = 'show-1';
const USER = 'user-1';

function paymentStepDraft(): SavedDraft {
  return {
    metadata: {
      id: 'draft-1',
      showId: SHOW,
      userId: USER,
      timestamp: Date.now(),
      stepCompleted: 'payment',
      title: 'Draft registration',
      preview: 'Draft registration',
      selectedDogsCount: 1,
      completed: false,
    },
    data: {
      selectedDogs: ['dog-1'],
      entries: [],
      documents: [],
      // The choice under test. `credit_card` is the wizard's own exhibitor
      // default, so asserting on it could pass on a draft that restored
      // nothing — use the other real self-service method.
      paymentMethod: 'check',
      specialRequests: undefined,
      _workflowState: {
        currentStep: 'payment',
        stepCompletionState: { 'dog-selection': true, 'class-selection': true },
        classSelections: [
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
        ],
        handlerAssignments: {},
        paymentStatus: PaymentStatus.PENDING,
        entryStatus: EntryStatus.PENDING,
      },
    },
  };
}

describe('RegistrationWizardPage — a reload on the payment step', () => {
  beforeEach(() => {
    sessionStorage.clear();
    capturedSelectedDogs = [];
    capturedStepId = '';
    mockCreateRegistration.mockClear();
    mockActivateDraft.mockClear();
    mockCreateRegistration.mockReturnValue({ id: 'reg-1' });
    mockDogStoreState.dogs = [{ id: 'dog-1', ownerId: 'user-1', ownerName: 'Owner' }];
    mockDogStoreState.isLoading = false;
    mockDogStoreState.isReady = true;
    mockProfileState.error = null;
    mockProfileState.profile = { id: 'profile-1', person_id: 'user-1' };
    const draft = paymentStepDraft();
    mockDraftState.saved = draft;
    mockDraftState.availableDrafts = [draft.metadata];
  });

  it('restores the payment step AND the chosen payment method, with no user action', async () => {
    markWizardSessionOpen(SHOW, USER);
    render(<RegistrationWizardPage />, { initialRoute: `/shows/${SHOW}/register` });

    await waitFor(() => expect(capturedStepId).toBe('payment'));
    expect(capturedSelectedDogs).toEqual(['dog-1']);
    // AC #1b: the method survives the reload, not just the step.
    await waitFor(() =>
      expect(screen.getByTestId('step-content')).toHaveAttribute('data-payment-method', 'check')
    );
    expect(mockActivateDraft).toHaveBeenCalledOnce();
  });

  it('restores nothing on a fresh visit, even with the same draft on disk', async () => {
    // No same-tab marker: this is MYK9-508's explicit Resume panel's case, and
    // silently restoring here would resume a sitting the exhibitor left behind.
    expect(sessionStorage.getItem(wizardSessionKey(SHOW, USER))).toBeNull();
    render(<RegistrationWizardPage />, { initialRoute: `/shows/${SHOW}/register` });

    await waitFor(() => expect(capturedStepId).toBe('dog-selection'));
    expect(mockActivateDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('step-content')).not.toHaveAttribute('data-payment-method', 'check');
  });
});
