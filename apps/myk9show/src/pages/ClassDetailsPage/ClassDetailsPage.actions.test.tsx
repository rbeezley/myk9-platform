import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
const mockUseClassDetailsDialogs = vi.hoisted(() => vi.fn());
const mockUseAuthContext = vi.hoisted(() => vi.fn());

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
  PageHeader: () => <div data-testid="page-header" />,
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
  ClassEditPanel: () => <div data-testid="class-edit-panel" />,
}));

vi.mock('./DeleteClassDialog', () => ({
  DeleteClassDialog: () => <div data-testid="delete-class-dialog" />,
}));

vi.mock('./EditEntryDialog', () => ({
  EditEntryDialog: () => null,
}));

vi.mock('./DeleteEntryDialog', () => ({
  DeleteEntryDialog: () => null,
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

describe('ClassDetailsPage header actions', () => {
  beforeEach(() => {
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
      editEntryDialogOpen: false,
      deleteDialogOpen: false,
      editEntryId: null,
      deleteEntryDialogOpen: false,
      entryToDelete: null,
      openEditClassPanel: vi.fn(),
      openDeleteDialog: vi.fn(),
      closeDeleteDialog: vi.fn(),
      closeEditClassPanel: vi.fn(),
      closeEditEntryDialog: vi.fn(),
      closeDeleteEntryDialog: vi.fn(),
      setDeleteDialogOpen: vi.fn(),
      setEditEntryDialogOpen: vi.fn(),
      setDeleteEntryDialogOpen: vi.fn(),
      openEditEntryDialog: vi.fn(),
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

    expect(screen.getByRole('menuitem', { name: /open in workbench/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mark in progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mark completed/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /open in workbench/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1/show-desk');
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
      '/shows/show-1/entry-management?trial=trial-1&class=class-1'
    );
  });

  it('offers class-lifecycle controls to a secretary', () => {
    renderClassDetailsPage();

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete class/i })).toBeInTheDocument();
    expect(screen.getByTestId('class-edit-panel')).toBeInTheDocument();
    expect(screen.getByTestId('delete-class-dialog')).toBeInTheDocument();
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

      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /delete class/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('class-edit-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-class-dialog')).not.toBeInTheDocument();
    });

    it('keeps the read-only affordances that are theirs', () => {
      renderClassDetailsPage();

      expect(screen.getByRole('menuitem', { name: /requirements/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /manage entries/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: /open in workbench/i })
      ).not.toBeInTheDocument();
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

      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /delete class/i })).toBeInTheDocument();
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

      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
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
