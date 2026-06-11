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
  ClassEditPanel: () => null,
}));

vi.mock('./DeleteClassDialog', () => ({
  DeleteClassDialog: () => null,
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

describe('ClassDetailsPage header actions', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 'secretary-1' },
      isSecretary: true,
      isAdmin: false,
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
      parentTrial: { id: 'trial-1', showId: 'show-1', trialNumber: 'Saturday Trial 1' },
      parentShow: { id: 'show-1', name: 'Spring Classic', organization: 'AKC' },
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

    expect(screen.getByTestId('location')).toHaveTextContent('/secretary/shows/show-1/show-desk');
  });

  it('does not duplicate show messaging from the class header', () => {
    renderClassDetailsPage();

    expect(screen.queryByRole('button', { name: /message class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show messages/i })).not.toBeInTheDocument();
  });
});
