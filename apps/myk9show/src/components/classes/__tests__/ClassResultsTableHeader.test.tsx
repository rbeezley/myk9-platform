/**
 * Tests for the ClassResultsTable header buttons (Requirements, Enter Scores, Add Entry).
 * Verifies button visibility is conditional on props and permissions.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../ClassResultsTable';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import { createUserPermissions } from '@/types/user-permissions';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
    isJudge: false,
    user: { id: 'test-user' },
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(null),
  },
}));

// Minimal valid props for ClassResultsTable
function makeProps(overrides: Record<string, unknown> = {}) {
  const entries: ScentWorkEntry[] = [];
  const classConfig: ScentWorkClassConfig = {
    element: 'Detective',
    level: 'Unknown',
    timeLimit: '3:00',
    multiArea: false,
    warningsEnabled: true,
  };
  const userPermissions = createUserPermissions('secretary', 'user-1', 'Test User');

  return {
    entries,
    rawEntries: [],
    classConfig,
    userPermissions,
    ...overrides,
  };
}

function renderTable(props: ReturnType<typeof makeProps>) {
  return render(<ClassResultsTable {...props} />);
}

describe('ClassResultsTable header buttons', () => {
  it('shows Requirements button when onOpenRequirements is provided', () => {
    const onOpen = vi.fn();
    renderTable(makeProps({ onOpenRequirements: onOpen }));
    expect(screen.getByText('Requirements')).toBeInTheDocument();
  });

  it('hides Requirements button when onOpenRequirements is not provided', () => {
    renderTable(makeProps());
    expect(screen.queryByText('Requirements')).not.toBeInTheDocument();
  });

  it('calls onOpenRequirements when Requirements button is clicked', async () => {
    const onOpen = vi.fn();
    renderTable(makeProps({ onOpenRequirements: onOpen }));
    await userEvent.click(screen.getByText('Requirements'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows Enter Scores button when classId is provided and user can edit', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    expect(screen.getByText('Enter Scores')).toBeInTheDocument();
  });

  it('hides Enter Scores button when classId is not provided', () => {
    renderTable(makeProps());
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('hides Enter Scores button when user cannot edit entries', () => {
    const readOnlyPerms = createUserPermissions('exhibitor', 'user-1', 'Test User');
    renderTable(makeProps({ classId: 'class-1', userPermissions: readOnlyPerms }));
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('shows entry count badge in the header', () => {
    renderTable(makeProps());
    // Badge shows "0" for empty entries
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('ClassResultsTable view toggle', () => {
  it('renders view toggle buttons when classId provided', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('defaults to table view', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    const tableBtn = screen.getByTitle('Table view');
    expect(tableBtn.className).toContain('bg-primary');
  });

  it('switches to card view when cards toggle is clicked', async () => {
    const entries: ScentWorkEntry[] = [
      {
        id: 'entry-1',
        status: 'registered',
        displayInfo: {
          armband: '107',
          dogName: 'Laila',
          dogBreed: 'Scottish Terrier',
          handlerName: 'Kathy Gray',
          dogId: 'dog-1',
          handlerId: 'handler-1',
        },
        classConfig: {
          element: 'Container',
          level: 'Advanced',
          timeLimit: '3:00',
          multiArea: false,
          warningsEnabled: true,
        },
      } as ScentWorkEntry,
    ];
    renderTable(makeProps({ classId: 'class-1', entries }));

    await userEvent.click(screen.getByTitle('Cards view'));
    // Card view renders dog name in card format
    expect(screen.getByText('Laila')).toBeInTheDocument();
    // Table-specific elements should not be visible
    expect(screen.queryByText('Dog & Handler')).not.toBeInTheDocument();
  });

  it('hides submit footer in card view', async () => {
    renderTable(makeProps({ classId: 'class-1' }));
    await userEvent.click(screen.getByTitle('Cards view'));
    expect(screen.queryByText(/Submit.*Results/)).not.toBeInTheDocument();
  });
});
