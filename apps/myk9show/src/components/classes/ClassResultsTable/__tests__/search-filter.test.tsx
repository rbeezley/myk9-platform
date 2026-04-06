import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps, ScoringRow } from '../types';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';

// --- Mocks ---

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('../useRunOrderDrag', () => ({
  useRunOrderDrag: ({ rawEntries }: { rawEntries: { id: string }[] }) => ({
    orderedIds:
      rawEntries.length > 0 ? rawEntries.map((e: { id: string }) => e.id) : ['e1', 'e2', 'e3'],
    sensors: [],
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  }),
}));

vi.mock('../SortableRow', () => ({
  SortableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  DragHandleCell: () => <td data-testid="drag-handle" />,
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));

vi.mock('@/components/common/StatusPickerDialog', () => ({
  StatusPickerDialog: () => null,
}));

const mockRows: ScoringRow[] = [
  {
    entryId: 'e1',
    armband: '101',
    dogName: 'Rex',
    dogBreed: 'Labrador',
    handlerName: 'Alice Smith',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    faults: '0',
    notes: '',
    placement: null,
    checkInStatus: 'no-status',
    isScored: false,
    hasEdits: false,
  },
  {
    entryId: 'e2',
    armband: '202',
    dogName: 'Buddy',
    dogBreed: 'Golden',
    handlerName: 'Bob Jones',
    qualification: 'Q',
    qualificationReason: '',
    searchTime: '01:30',
    faults: '0',
    notes: '',
    placement: 1,
    checkInStatus: 'checked-in',
    isScored: true,
    hasEdits: false,
  },
  {
    entryId: 'e3',
    armband: '303',
    dogName: 'Max',
    dogBreed: 'Beagle',
    handlerName: 'Carol Davis',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    faults: '0',
    notes: '',
    placement: null,
    checkInStatus: 'no-status',
    isScored: false,
    hasEdits: false,
  },
];

vi.mock('../useClassResults', () => ({
  useClassResults: () => ({
    rows: mockRows,
    isSubmitting: false,
    submitError: null,
    editCount: 0,
    canSubmit: false,
    onFieldChange: vi.fn(),
    clearEntry: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSubmit: vi.fn(),
    isEntryScored: (id: string) => mockRows.find(r => r.entryId === id)?.isScored ?? false,
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: false,
    isSecretary: true,
    isJudge: false,
    isAdmin: false,
    user: { id: 'u1' },
  }),
}));

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => ({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    selfCheckinEnabled: false,
  }),
  deriveClassState: () => 'in-progress',
}));

vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['table', vi.fn()],
  CARD_TABLE_MODES: [
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ],
}));

// --- Helpers ---

function makeEntry(
  id: string,
  armband: string,
  dogName: string,
  handlerName: string
): ScentWorkEntry {
  return {
    id,
    displayInfo: {
      armband,
      dogName,
      dogBreed: 'Unknown',
      handlerName,
      dogId: `dog-${id}`,
      handlerId: `handler-${id}`,
    },
    classConfig: {} as ScentWorkClassConfig,
    checkInStatus: 'no-status',
  } as ScentWorkEntry;
}

const defaultEntries: ScentWorkEntry[] = [
  makeEntry('e1', '101', 'Rex', 'Alice Smith'),
  makeEntry('e2', '202', 'Buddy', 'Bob Jones'),
  makeEntry('e3', '303', 'Max', 'Carol Davis'),
];

const defaultProps: ClassResultsTableProps = {
  entries: defaultEntries,
  rawEntries: [],
  classConfig: { scoringType: 'standard' } as ScentWorkClassConfig,
  userPermissions: {
    canEditEntries: true,
    canViewResults: true,
  } as UserPermissions,
  classId: 'cls-1',
  showId: 'show-1',
  trialId: 'trial-1',
};

function renderTable(overrides: Partial<ClassResultsTableProps> = {}) {
  return render(<ClassResultsTable {...defaultProps} {...overrides} />);
}

// --- Tests ---

describe('ClassResultsTable search/filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search input', () => {
    renderTable();
    expect(screen.getByLabelText('Search entries')).toBeInTheDocument();
  });

  it('shows placeholder text in the search input', () => {
    renderTable();
    const input = screen.getByLabelText('Search entries');
    expect(input).toHaveAttribute('placeholder', 'Search by dog, handler, or armband...');
  });

  it('filters entries by dog name', async () => {
    const { user } = renderTable();
    // Switch to All tab so all entries are visible
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'Rex');

    // Rex should remain, Buddy and Max should be filtered out
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('filters entries by handler name', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'Bob');

    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('filters entries by armband number', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, '202');

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'rex');

    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('shows clear button when search has text', async () => {
    const { user } = renderTable();
    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'Rex');

    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('does not show clear button when search is empty', () => {
    renderTable();
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'Rex');

    // Only Rex visible
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();

    // Clear
    await user.click(screen.getByLabelText('Clear search'));

    // All entries visible again
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('filters within the active tab only', async () => {
    const { user } = renderTable();

    // On Pending tab by default — Buddy is scored so not shown
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();

    // Search for Max on Pending tab
    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'Max');

    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    // Buddy is still not shown (it's completed, not pending)
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
  });

  it('returns no results when search has no matches', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));

    const searchInput = screen.getByLabelText('Search entries');
    await user.type(searchInput, 'zzzznonexistent');

    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });
});
