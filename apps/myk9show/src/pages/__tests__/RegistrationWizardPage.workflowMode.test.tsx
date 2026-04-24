/**
 * Tests that RegistrationWizardPage derives workflowMode from the user's actual
 * role flags (via useRegistrationPermissions), NOT from the RegistrationContext's
 * `mode` value which defaults to 'exhibitor' while RBAC data is still loading.
 *
 * Root cause: the previous `if (mode) return mode as WorkflowMode` short-circuit
 * would return 'exhibitor' (truthy) for every role until RBAC loaded, causing
 * secretaries to see the exhibitor dog-list UI ("No dogs found") instead of the
 * full-system search interface.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WORKFLOW_CONFIGS } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';

// ─── react-router-dom ────────────────────────────────────────────────────────
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
vi.mock('@/store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    createRegistration: vi.fn(() => ({ id: 'reg-1' })),
    submitRegistration: vi.fn(),
    confirmRegistration: vi.fn(),
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

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ triggerSync: vi.fn() }),
}));

vi.mock('@/hooks/useDraftPersistence', () => ({
  useDraftPersistence: () => ({
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    deleteDraft: vi.fn(),
    availableDrafts: [],
    clearAllDrafts: vi.fn(),
    hasUnsavedChanges: false,
  }),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [], isLoading: false }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [] }),
}));

// ─── RegistrationContext — page wraps content in RegistrationProvider.
//     The page must NOT derive workflowMode from RegistrationContext.mode.
vi.mock('@/context/RegistrationContext', () => ({
  RegistrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── useRegistrationPermissions — mutable per test ───────────────────────────
const mockPermissions = {
  canCreateExhibitor: false,
  isSecretary: false,
  isClubAdmin: false,
  isSiteAdmin: false,
};
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => mockPermissions,
}));

// ─── Child components — capture the workflowConfig passed to WorkflowStepContent
let capturedWorkflowConfig: (typeof WORKFLOW_CONFIGS)[keyof typeof WORKFLOW_CONFIGS] | null = null;

vi.mock('@/components/shows/RegistrationWorkflow/WorkflowStepContent', () => ({
  WorkflowStepContent: (props: {
    currentWorkflowConfig: (typeof WORKFLOW_CONFIGS)[keyof typeof WORKFLOW_CONFIGS];
  }) => {
    capturedWorkflowConfig = props.currentWorkflowConfig;
    return (
      <div
        data-testid="step-content"
        data-advanced-search={String(props.currentWorkflowConfig?.features?.advancedSearch)}
      />
    );
  },
}));

vi.mock('@/components/shows/wizard/components/VerticalProgressIndicator', () => ({
  default: () => <div data-testid="progress" />,
}));

vi.mock('@/components/shows/wizard/components/WizardNavigation', () => ({
  default: () => <div data-testid="nav" />,
}));

vi.mock('@/components/shows/RegistrationWorkflow/DraftManager', () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
}));

vi.mock('@/components/common/ErrorBoundary', () => ({
  RegistrationErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/database/queries/armbandQueries', () => ({
  assignArmband: vi.fn(),
}));

// ─── Import page after all mocks ─────────────────────────────────────────────
import RegistrationWizardPage from '../RegistrationWizardPage';

describe('RegistrationWizardPage — workflowMode derivation', () => {
  beforeEach(() => {
    capturedWorkflowConfig = null;
    // Reset to exhibitor defaults
    mockPermissions.canCreateExhibitor = false;
    mockPermissions.isSecretary = false;
    mockPermissions.isClubAdmin = false;
    mockPermissions.isSiteAdmin = false;
  });

  it('uses exhibitor config when user is an exhibitor', async () => {
    // All flags false → exhibitor
    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(capturedWorkflowConfig?.features.advancedSearch).toBe(false);
  });

  it('uses secretary_existing config when user is a secretary without create-exhibitor permission', async () => {
    mockPermissions.isSecretary = true;
    mockPermissions.canCreateExhibitor = false;

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    // secretary_existing has advancedSearch: true
    expect(capturedWorkflowConfig?.features.advancedSearch).toBe(true);
  });

  it('uses secretary_new config when user is a secretary with create-exhibitor permission', async () => {
    mockPermissions.isSecretary = true;
    mockPermissions.canCreateExhibitor = true;

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(capturedWorkflowConfig?.features.advancedSearch).toBe(true);
    expect(capturedWorkflowConfig?.features.createNew).toBe(true);
  });

  it('uses club_admin config when user is a club admin', async () => {
    mockPermissions.isClubAdmin = true;

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(capturedWorkflowConfig?.features.advancedSearch).toBe(true);
  });

  it('uses site_admin config when user is a site admin', async () => {
    mockPermissions.isSiteAdmin = true;

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    expect(capturedWorkflowConfig?.features.advancedSearch).toBe(true);
  });

  it('site_admin takes precedence over secretary flag', async () => {
    mockPermissions.isSiteAdmin = true;
    mockPermissions.isSecretary = true;

    render(<RegistrationWizardPage />, { initialRoute: '/shows/show-1/register' });

    await waitFor(() => expect(screen.getByTestId('step-content')).toBeInTheDocument());

    // Should map to 'site_admin' config, not 'secretary_existing'
    expect(capturedWorkflowConfig).toStrictEqual(WORKFLOW_CONFIGS.site_admin);
  });
});
