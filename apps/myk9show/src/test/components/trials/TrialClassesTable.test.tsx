import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { TrialClassesTable } from '@/components/trials/TrialDetail/TrialClassesTable';
import { TrialClass } from '@/components/trials/types/trial.types';

// Mock navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const renderWithRouter = render;

// Mock class data
const mockClasses: TrialClass[] = [
  {
    id: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'Upcoming',
    judgeId: 'judge-1',
    judgeName: 'John Smith',
    startTime: '2024-06-15T09:00:00',
    entries: 10,
  },
  {
    id: 'class-2',
    element: 'Interior',
    level: 'Advanced',
    section: 'B',
    status: 'Completed',
    judgeId: 'judge-2',
    judgeName: 'Jane Doe',
    startTime: '2024-06-15T10:00:00',
    entries: 8,
  },
  {
    id: 'class-3',
    element: 'Exterior',
    level: 'Novice',
    section: 'A',
    status: 'In Progress',
    judgeId: 'judge-1',
    judgeName: 'John Smith',
    startTime: '2024-06-15T11:00:00',
    entries: 12,
  },
];

const mockHandlers = {
  onAddClassesFromTemplate: vi.fn(),
  onEditClass: vi.fn(),
  onDeleteClass: vi.fn(),
};

describe('TrialClassesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // These tests exercise the table; a remembered choice beats the role's default view.
    localStorage.setItem('view-pref-trial-classes', 'table');
  });

  describe('Empty State', () => {
    it('displays icon in empty state', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('displays the management call-to-action for staff', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          canManage
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('No classes yet')).toBeInTheDocument();
      expect(
        screen.getByText('Add classes to start managing entries and scores')
      ).toBeInTheDocument();
    });

    it('displays a neutral read-only message for non-staff (no management pitch)', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('No classes yet')).toBeInTheDocument();
      expect(
        screen.getByText('Classes for this trial have not been published yet')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Add classes to start managing entries and scores')
      ).not.toBeInTheDocument();
    });

    it('shows Add Classes button when handler provided and user can manage', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          canManage
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByRole('button', { name: /add classes/i })).toBeInTheDocument();
    });

    it('calls onAddClassesFromTemplate when Add Classes button is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          canManage
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      await user.click(screen.getByRole('button', { name: /add classes/i }));
      expect(mockHandlers.onAddClassesFromTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search', () => {
    it('has concise search placeholder', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search classes...');
      expect(searchInput).toBeInTheDocument();
    });

    it('filters classes based on search term', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search classes...');
      await user.type(searchInput, 'Container');

      // DataTableSearch debounces 300ms — wait for filter to apply
      await waitFor(
        () => {
          expect(screen.queryByText('Interior')).not.toBeInTheDocument();
        },
        { timeout: 1000 }
      );
      expect(screen.getByText('Container')).toBeInTheDocument();
      expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
    });

    it('shows "no classes found" message when search yields no results', async () => {
      const user = userEvent.setup({ delay: null });
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search classes...');
      await user.type(searchInput, 'NonexistentClass');

      // DataTableSearch debounces 300ms — wait for filter to apply
      await waitFor(
        () =>
          expect(
            screen.getByRole('heading', { name: 'No classes match your search or filters.' })
          ).toBeInTheDocument(),
        { timeout: 1000 }
      );
    });
  });

  describe('Table View', () => {
    it('displays all classes when no filter is applied', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('Container')).toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.getByText('Exterior')).toBeInTheDocument();
    });

    it('says how many classes it shows in the result line', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByRole('status')).toHaveTextContent('Showing all 3 classes.');
    });
  });

  describe('View Toggle', () => {
    it('has table and card view toggle buttons', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByTitle('Table view')).toBeInTheDocument();
      expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    });

    it('defaults to table view', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      // Table headers should be visible
      expect(screen.getByRole('columnheader', { name: /element/i })).toBeInTheDocument();
    });
  });

  // MYK9-811 rehearsal note: level order must come from the shared
  // `compareLevels` helper the wizard uses, not an ad-hoc table — the old one
  // had no Open/Utility entries and tied "Novice A" and "Novice B" apart
  // instead of leaving them as sections of one level.
  describe('Level sort (shared compareLevels helper)', () => {
    it('sorts by the canonical progression when the Level column header is clicked', async () => {
      const user = userEvent.setup();
      const openLevel: TrialClass = {
        id: 'class-open',
        element: 'Interior',
        level: 'Open',
        section: '',
        status: 'Upcoming',
        judgeId: 'judge-1',
        judgeName: 'John Smith',
        startTime: '2024-06-15T12:00:00',
        entries: 5,
      };
      const { container } = renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[...mockClasses, openLevel]}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      // The sort click handler lives on `DataTableColumnHeader`'s inner
      // button, not the outer <th role="columnheader">.
      await user.click(screen.getByRole('button', { name: /^Level,/ }));

      // DataTable's rows carry role="button" (row navigation), not role="row".
      const levelCells = Array.from(container.querySelectorAll('tbody tr')).map(
        row => row.querySelectorAll('td')[1]?.textContent
      );
      // Novice(s), then Advanced, then Open — the canonical progression order;
      // the old ad-hoc table had no "Open" entry at all and would have sorted
      // it last regardless. Advanced (section B) shows no section suffix
      // (shouldShowSection: only Novice has sections).
      expect(levelCells).toEqual(['Novice A', 'Novice A', 'Advanced', 'Open']);
    });
  });

  describe('Status Badges', () => {
    it('displays status badges for each class', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('Not started')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
  });

  describe('Add Classes Button', () => {
    it('has no Add Classes button in the header: it is the Actions menu item (MYK9-928)', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          canManage
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.queryByRole('button', { name: /add classes/i })).not.toBeInTheDocument();
      // Positive control: the table did render for this managing viewer.
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 3 classes.');
    });
  });

  // Read-only / non-organizer view: the trial page is now a public surface
  // (exhibitors are deep-linked here), so management chrome must be absent
  // for anyone who is not staff (canManage defaults to false).
  describe('Read-only view (canManage = false)', () => {
    it('hides the Add Classes button in the header even when a handler is provided', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.queryByRole('button', { name: /add classes/i })).not.toBeInTheDocument();
    });

    it('hides the Add Classes button in the empty state even when a handler is provided', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={[]}
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.queryByRole('button', { name: /add classes/i })).not.toBeInTheDocument();
    });

    it('hides the row Actions column (no Edit/Delete affordances)', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.queryByRole('columnheader', { name: /actions/i })).not.toBeInTheDocument();
    });

    it('hides the "Manage the classes for this trial" subtitle', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.queryByText(/manage the classes for this trial/i)).not.toBeInTheDocument();
    });

    it('still renders the class list read-only (classes remain visible)', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      // Read-only visitors can still browse the schedule.
      expect(screen.getByText('Container')).toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.getByText('Exterior')).toBeInTheDocument();
    });

    it('shows the Actions column when canManage is true', () => {
      renderWithRouter(
        <TrialClassesTable
          showId="show-1"
          classes={mockClasses}
          canManage
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
    });
  });
});
