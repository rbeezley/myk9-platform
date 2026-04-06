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

let mockAuthContext = {
  isExhibitor: false,
  isSecretary: true,
  isJudge: false,
  isAdmin: false,
  user: { id: 'u1' },
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
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

describe('ClassResultsTable drag handle visibility', () => {
  beforeEach(() => {
    mockAuthContext = {
      isExhibitor: false,
      isSecretary: true,
      isJudge: false,
      isAdmin: false,
      user: { id: 'u1' },
    };
    vi.clearAllMocks();
  });

  it('shows drag handles on Pending tab for secretary (non-closed class)', () => {
    renderTable();
    expect(screen.getAllByTestId('drag-handle').length).toBeGreaterThan(0);
  });

  it('shows drag handles on All tab for secretary (non-closed class)', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));
    expect(screen.getAllByTestId('drag-handle').length).toBeGreaterThan(0);
  });

  it('hides drag handles on Completed tab', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /completed/i }));
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('hides drag handles when class is closed', () => {
    renderTable({ classStatus: 'closed' });
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('hides drag handles when search filter is active', async () => {
    const { user } = renderTable();
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'Rex');
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('hides drag handles for exhibitor user', () => {
    mockAuthContext = {
      isExhibitor: true,
      isSecretary: false,
      isJudge: false,
      isAdmin: false,
      user: { id: 'u1' },
    };
    renderTable({
      userPermissions: {
        canEditEntries: false,
        canViewResults: true,
      } as UserPermissions,
    });
    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });
});
