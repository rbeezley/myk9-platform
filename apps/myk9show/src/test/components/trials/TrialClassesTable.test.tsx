import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
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

// Helper to wrap component with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

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
  });

  describe('Empty State', () => {
    it('displays icon in empty state', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={[]}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    });

    it('displays helpful message text', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={[]}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('No classes yet')).toBeInTheDocument();
      expect(
        screen.getByText('Add classes to start managing entries and scores')
      ).toBeInTheDocument();
    });

    it('shows Add Classes button when handler provided', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={[]}
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
          classes={[]}
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
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search classes...');
      await user.type(searchInput, 'NonexistentClass');

      // DataTableSearch debounces 300ms — wait for filter to apply
      await waitFor(() => expect(screen.getByText(/no classes found/i)).toBeInTheDocument(), {
        timeout: 1000,
      });
    });
  });

  describe('Table View', () => {
    it('displays all classes when no filter is applied', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('Container')).toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.getByText('Exterior')).toBeInTheDocument();
    });

    it('shows class count in header', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText(/classes \(3\)/i)).toBeInTheDocument();
    });

    it('still shows total count in header when search is active', async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search classes...');
      await user.type(searchInput, 'Novice');

      // Header always shows total count; filtering is handled inside DataTable
      expect(screen.getByText(/classes \(3\)/i)).toBeInTheDocument();
    });
  });

  describe('View Toggle', () => {
    it('has table and card view toggle buttons', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByTitle('Table view')).toBeInTheDocument();
      expect(screen.getByTitle('Card view')).toBeInTheDocument();
    });

    it('defaults to table view', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      // Table headers should be visible
      expect(screen.getByRole('columnheader', { name: /element/i })).toBeInTheDocument();
    });
  });

  describe('Status Badges', () => {
    it('displays status badges for each class', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByText('Upcoming')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
  });

  describe('Add Classes Button', () => {
    it('shows Add Classes button in header when classes exist', () => {
      renderWithRouter(
        <TrialClassesTable
          classes={mockClasses}
          onAddClassesFromTemplate={mockHandlers.onAddClassesFromTemplate}
          onEditClass={mockHandlers.onEditClass}
          onDeleteClass={mockHandlers.onDeleteClass}
        />
      );

      expect(screen.getByRole('button', { name: /add classes/i })).toBeInTheDocument();
    });
  });
});
