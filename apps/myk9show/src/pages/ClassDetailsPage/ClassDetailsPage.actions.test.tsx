import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
const mockUseClassDetailsDialogs = vi.hoisted(() => vi.fn());
const mockUseAuthContext = vi.hoisted(() => vi.fn());
const openEditClassPanel = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('./useClassDetailsData', () => ({
  useClassDetailsData: mockUseClassDetailsData,
}));

vi.mock('./useClassDetailsDialogs', () => ({
  useClassDetailsDialogs: mockUseClassDetailsDialogs,
}));

vi.mock('./useMyEntriesInClass', () => ({
  useMyEntriesInClass: () => ({ myEntries: [], isAfterClass: false }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: mockUseAuthContext,
}));

vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({
    breadcrumbs = [],
    omitTitle,
  }: {
    breadcrumbs?: Array<{ label: string; href: string }>;
    omitTitle?: boolean;
  }) => (
    <div data-testid="page-header" data-omit-title={String(Boolean(omitTitle))}>
      <nav aria-label="Breadcrumb">
        {breadcrumbs.map(crumb => (
          <a key={crumb.href} href={crumb.href}>
            {crumb.label}
          </a>
        ))}
      </nav>
    </div>
  ),
}));

vi.mock('@/components/classes/ClassCompactHeader', () => ({
  ClassCompactHeader: ({ actions }: { actions?: ReactNode }) => (
    <div data-testid="class-compact-header">{actions}</div>
  ),
}));

vi.mock('@/components/classes/ClassDetailsMain', () => ({
  default: () => <div data-testid="class-details-main" />,
}));

vi.mock('./SecretaryRunSheet', () => ({
  SecretaryRunSheet: () => <div data-testid="secretary-run-sheet" />,
}));

vi.mock('@/components/panels/edit/ClassEditPanel', () => ({
  ClassEditPanel: ({ onDelete }: { onDelete?: { kind: string } }) => (
    <div data-testid="class-edit-panel" data-delete-kind={onDelete?.kind ?? ''} />
  ),
}));

vi.mock('@/features/delete/DeleteObjectDialog', () => ({
  DeleteObjectDialog: ({ kind }: { kind: string }) => <div data-testid={`delete-${kind}-dialog`} />,
}));

vi.mock('@/components/classes/ClassRequirementsPanel', () => ({
  ClassRequirementsPanel: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    className?: string | undefined;
  }) => (
    <button type="button" role="menuitem" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

import ClassDetailsPage from './index';

const currentClass: ClassData = {
  id: 'class-1',
  trialId: 'trial-1',
  trial: 'Saturday Trial 1',
  trialDate: '2026-05-22',
  trialNumber: '1',
  classOrder: '1',
  status: 'In Progress',
  judge: 'Judge Judy',
  className: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderClassDetailsPage() {
  return render(
    <>
      <ClassDetailsPage />
      <LocationProbe />
    </>,
    {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    }
  );
}

/**
 * Restate the ownership gate for one scenario, leaving the rest of the page's
 * data fixture intact.
 */
function mockManageScope(scope: {
  status: 'resolved' | 'resolving' | 'unavailable';
  canManage: boolean;
  /** Show-day staff. Strictly narrower than canManage — a club admin has the
   *  first without the second, so every scenario states it explicitly. */
  canOperate: boolean;
  hasOperationalStaffRole: boolean;
  clubId?: string;
}) {
  mockUseClassDetailsData.mockReturnValue({
    ...mockUseClassDetailsData(),
    manageScope: { clubId: undefined, ...scope },
  });
}

describe('ClassDetailsPage detail-page header (MYK9-930)', () => {
  function mountSecretaryClass() {
    mockUseAuthContext.mockReturnValue({
      user: { id: 'secretary-1' },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
      userWithRoles: { id: 'secretary-1', scopes: [] },
    });
    mockUseClassDetailsDialogs.mockReturnValue({
      editClassPanelOpen: false,
      deleteDialogOpen: false,
      deleteEntryDialogOpen: false,
      entryToDelete: null,
      openEditClassPanel: vi.fn(),
      openDeleteDialog: vi.fn(),
      closeDeleteDialog: vi.fn(),
      closeEditClassPanel: vi.fn(),
      closeDeleteEntryDialog: vi.fn(),
      setDeleteDialogOpen: vi.fn(),
      setDeleteEntryDialogOpen: vi.fn(),
      openDeleteEntryDialog: vi.fn(),
    });
    mockUseClassDetailsData.mockReturnValue({
      classId: 'class-1',
      trialId: 'trial-1',
      classes: [currentClass],
      currentClass,
      trialClasses: [currentClass],
      localRawEntries: [],
      dbRawEntries: [],
      classEntries: [],
      entriesLoading: false,
      entriesError: null,
      manageScope: {
        status: 'resolved',
        canManage: true,
        canOperate: true,
        hasOperationalStaffRole: true,
        clubId: 'club-1',
      },
      parentTrial: { id: 'trial-1', showId: 'show-1', trialNumber: 'Saturday Trial 1' },
      parentShow: { id: 'show-1', name: 'Spring Classic', organization: 'AKC', clubId: 'club-1' },
      dogs: [],
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
    });
  }

  it('breadcrumb links up through Shows, the show and the trial', () => {
    mountSecretaryClass();
    renderClassDetailsPage();

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
    expect(trail.getByRole('link', { name: 'Spring Classic' })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
    expect(trail.getByRole('link', { name: 'Saturday Trial 1' })).toHaveAttribute(
      'href',
      '/trials/trial-1'
    );
  });

  it('lets the hero own the h1, so the breadcrumb header renders no title', () => {
    mountSecretaryClass();
    renderClassDetailsPage();

    expect(screen.getByTestId('page-header')).toHaveAttribute('data-omit-title', 'true');
  });

  it('shows the shared not-found state, in the page shell, when the class is gone', async () => {
    mountSecretaryClass();
    mockUseClassDetailsData.mockReturnValue({
      ...mockUseClassDetailsData(),
      currentClass: null,
      classes: [],
      trialClasses: [currentClass],
    });
    const { user } = renderClassDetailsPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Class Not Found' })).toBeInTheDocument();
    // `/classes` is not a list page; the way back is the parent trial.
    await user.click(screen.getByRole('button', { name: 'Back to Trial' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/trials/trial-1');
  });
});

describe('ClassDetailsPage header actions', () => {
  beforeEach(() => {
    openEditClassPanel.mockReset();
    usePageEditTargetStore.setState({ target: null, owner: null });
    // A club-scoped secretary grant for THIS show's club (club-1). A secretary
    // with no scopes cannot exist — every secretary row in user_roles carries a
    // club_id, and the server's is_trial_secretary(club) matches on it — so the
    // scope has to be present for this fixture to represent a real user.
    mockUseAuthContext.mockReturnValue({
      user: { id: 'secretary-1' },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
      userWithRoles: {
        id: 'secretary-1',
        scopes: [
          {
            userId: 'secretary-1',
            roleId: 'secretary',
            scopeType: 'club',
            scopeId: 'club-1',
            createdAt: new Date(),
          },
        ],
      },
    });
    mockUseClassDetailsDialogs.mockReturnValue({
      editClassPanelOpen: false,
      deleteEntryDialogOpen: false,
      entryToDelete: null,
      openEditClassPanel,
      closeEditClassPanel: vi.fn(),
      closeDeleteEntryDialog: vi.fn(),
      setDeleteEntryDialogOpen: vi.fn(),
      openDeleteEntryDialog: vi.fn(),
    });
    mockUseClassDetailsData.mockReturnValue({
      classId: 'class-1',
      trialId: 'trial-1',
      isResultsView: false,
      classes: [currentClass],
      currentClass,
      trialClasses: [currentClass],
      localRawEntries: [],
      dbRawEntries: [],
      classEntries: [],
      entriesLoading: false,
      entriesError: null,
      // The page reads ONE gate result (MYK9-464) instead of re-deriving RBAC.
      // Which viewer maps to which result is covered by the gate's own tests in
      // hooks/__tests__/useShowManageScope.test.tsx; here we assert what the
      // page renders GIVEN a result, so each scenario states its result.
      manageScope: {
        status: 'resolved',
        canManage: true,
        canOperate: true,
        hasOperationalStaffRole: true,
        clubId: 'club-1',
      },
      parentTrial: { id: 'trial-1', showId: 'show-1', trialNumber: 'Saturday Trial 1' },
      parentShow: {
        id: 'show-1',
        name: 'Spring Classic',
        organization: 'AKC',
        clubId: 'club-1',
      },
      dogs: [],
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
    });
  });

  it('routes secretaries to the workbench instead of duplicating class lifecycle actions', async () => {
    const { user } = renderClassDetailsPage();

    expect(screen.getByRole('menuitem', { name: /^show day$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mark in progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mark completed/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /^show day$/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1/show-day');
  });

  it('names the overflow trigger "Class options" for screen readers', () => {
    renderClassDetailsPage();

    expect(screen.getByRole('button', { name: 'Class options' })).toBeInTheDocument();
  });

  it('does not duplicate show messaging from the class header', () => {
    renderClassDetailsPage();

    expect(screen.queryByRole('button', { name: /message class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show messages/i })).not.toBeInTheDocument();
  });

  it('keeps the current class when opening Manage Entries', async () => {
    const { user } = renderClassDetailsPage();

    await user.click(screen.getByRole('button', { name: /manage entries/i }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/entries?trial=trial-1&class=class-1'
    );
  });

  it('offers class-lifecycle controls to a secretary, with Edit in the Actions menu (MYK9-928)', () => {
    renderClassDetailsPage();

    // No visible page-level Edit button; the header Actions menu carries "Edit class".
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    expect(usePageEditTargetStore.getState().target?.kind).toBe('class');
    usePageEditTargetStore.getState().target?.run();
    expect(openEditClassPanel).toHaveBeenCalledTimes(1);
    // Delete class is the Edit panel's footer button, never a header menu item.
    expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('class-edit-panel')).toHaveAttribute('data-delete-kind', 'class');
    // The shared delete dialog mounts only when Delete is chosen.
    expect(screen.queryByTestId('delete-class-dialog')).not.toBeInTheDocument();
  });

  // MYK9-123: this route is public, so an exhibitor lands here from a show page.
  // The page tells them it is read-only; the controls have to agree, and the
  // panels behind them must not even be mounted.
  describe('viewed by an exhibitor', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({
        user: { id: 'exhibitor-1' },
        isSecretary: false,
        isAdmin: false,
        hasRole: () => false,
        userWithRoles: { id: 'exhibitor-1', scopes: [] },
      });
      mockManageScope({
        status: 'resolved',
        canManage: false,
        canOperate: false,
        hasOperationalStaffRole: false,
      });
    });

    it('hides Edit Class and Delete Class, and mounts neither panel', () => {
      renderClassDetailsPage();

      expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
      expect(usePageEditTargetStore.getState().target).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('class-edit-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-class-dialog')).not.toBeInTheDocument();
    });

    it('keeps the read-only affordances that are theirs', () => {
      renderClassDetailsPage();

      expect(screen.getByRole('menuitem', { name: /requirements/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /manage entries/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /^show day$/i })).not.toBeInTheDocument();
    });
  });

  describe('viewed by a club admin', () => {
    function mockClubAdmin(scopedClubId: string) {
      mockUseAuthContext.mockReturnValue({
        user: { id: 'club-admin-1' },
        isSecretary: false,
        isAdmin: false,
        hasRole: (role: string) => role === 'club_admin',
        userWithRoles: {
          id: 'club-admin-1',
          scopes: [
            {
              userId: 'club-admin-1',
              roleId: 'club_admin',
              scopeType: 'club',
              scopeId: scopedClubId,
              createdAt: new Date(),
            },
          ],
        },
      });
    }

    it('keeps class controls for an admin of this show’s club', () => {
      mockClubAdmin('club-1');
      // A club admin of THIS club: lifecycle rights, but not show-day staff.
      mockManageScope({
        status: 'resolved',
        canManage: true,
        canOperate: false,
        hasOperationalStaffRole: false,
        clubId: 'club-1',
      });

      renderClassDetailsPage();

      expect(usePageEditTargetStore.getState().target?.kind).toBe('class');
      expect(screen.getByTestId('class-edit-panel')).toHaveAttribute('data-delete-kind', 'class');
    });

    it('denies an admin of a different club', () => {
      mockClubAdmin('club-2');
      mockManageScope({
        status: 'resolved',
        canManage: false,
        canOperate: false,
        hasOperationalStaffRole: false,
        clubId: 'club-1',
      });

      renderClassDetailsPage();

      expect(usePageEditTargetStore.getState().target).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /delete class/i })).not.toBeInTheDocument();
    });
  });

  // Positive control for the assertion below: without this, a fixture that
  // simply left the viewer off the staff surface would satisfy the absence
  // check for the wrong reason.
  it('renders the run sheet for operational staff when entries load', () => {
    renderClassDetailsPage();

    expect(screen.getByTestId('secretary-run-sheet')).toBeInTheDocument();
  });

  // The case the row-count escape was letting through: ownership could not be
  // verified, so the rows on hand came from the PUBLIC query. Rendering them as
  // a run sheet shows non-staff data on the staff surface.
  it('does not render the run sheet over public rows when show scope is unavailable', () => {
    mockUseClassDetailsData.mockReturnValue({
      ...mockUseClassDetailsData(),
      manageScope: {
        status: 'unavailable',
        canManage: false,
        canOperate: false,
        hasOperationalStaffRole: true,
        clubId: undefined,
      },
      // Rows ARE present — this is what defeated the `length === 0` guard.
      dbRawEntries: [{ id: 'entry-1', armband: '101', is_scored: false }],
      entriesLoading: false,
      entriesError: 'We could not verify this show’s ownership. Please retry.',
    });

    renderClassDetailsPage();

    expect(screen.queryByTestId('secretary-run-sheet')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not verify/i);
  });

  it('still renders the run sheet when scope is fine and rows are present', () => {
    mockUseClassDetailsData.mockReturnValue({
      ...mockUseClassDetailsData(),
      dbRawEntries: [{ id: 'entry-1', armband: '101', is_scored: false }],
      entriesLoading: false,
      entriesError: null,
    });

    renderClassDetailsPage();

    expect(screen.getByTestId('secretary-run-sheet')).toBeInTheDocument();
  });

  it('does not render a confident empty run sheet when staff entries are unavailable', () => {
    mockUseClassDetailsData.mockReturnValue({
      ...mockUseClassDetailsData(),
      entriesLoading: false,
      entriesError: "We couldn't load entries for this show. Please retry.",
    });

    renderClassDetailsPage();

    expect(screen.queryByTestId('secretary-run-sheet')).not.toBeInTheDocument();
  });
});

// MYK9-785: a guest's class is the server's answer only, so each state of that
// read renders on its own and never falls through to a store-driven state.
describe('ClassDetailsPage for a signed-out guest', () => {
  const retryGuestClassRead = vi.fn();

  function mockGuestRead(guestClassState: 'loading' | 'offline' | 'error' | 'ready') {
    mockUseClassDetailsData.mockReturnValue({
      classId: 'class-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classes: [],
      currentClass: null,
      trialClasses: [],
      guestClassState,
      retryGuestClassRead,
      localRawEntries: [],
      dbRawEntries: [],
      classEntries: [],
      entriesLoading: false,
      entriesError: null,
      manageScope: {
        status: 'resolved',
        canManage: false,
        canOperate: false,
        hasOperationalStaffRole: false,
      },
      parentTrial: undefined,
      parentShow: undefined,
      dogs: [],
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthContext.mockReturnValue({ user: null, hasRole: () => false, userWithRoles: null });
    mockUseClassDetailsDialogs.mockReturnValue({});
  });

  it('shows the loading state while the server read runs', () => {
    mockGuestRead('loading');
    renderClassDetailsPage();

    expect(screen.getByRole('status', { name: /loading class details/i })).toBeInTheDocument();
    expect(screen.queryByText(/no classes available/i)).not.toBeInTheDocument();
  });

  it.each([
    ['offline', /you're offline/i],
    ['error', /couldn't load this class/i],
  ] as const)('shows a retryable %s state', async (state, message) => {
    mockGuestRead(state);
    const { user } = renderClassDetailsPage();

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(retryGuestClassRead).toHaveBeenCalledTimes(1);
  });

  it('shows not found, with a way back to the show, when anon may not see the class', async () => {
    mockGuestRead('ready');
    const { user } = renderClassDetailsPage();

    expect(screen.getByRole('heading', { name: /class not found/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to show/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1');
  });
});
