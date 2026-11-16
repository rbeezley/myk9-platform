import { captureCsvDownload } from '@/test/utils/csvDownload';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps, ScoringRow } from '../types';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';

// --- Mocks (mirror search-filter.test.tsx harness) ---

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    orderedIds: rawEntries.length > 0 ? rawEntries.map(e => e.id) : ['e1', 'e2', 'e3'],
    sensors: [],
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  }),
}));

vi.mock('../SortableRow', () => ({
  SortableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  DragHandleCell: () => <td />,
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));

vi.mock('@/components/common/StatusPickerDialog', () => ({
  StatusPickerDialog: () => null,
}));

let mockRows: ScoringRow[] = [
  {
    entryId: 'e1',
    armband: '101',
    dogName: 'Rex',
    dogBreed: 'Labrador',
    handlerName: 'Alice Smith',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    elementTime: '',
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
    qualification: 'Qualified',
    qualificationReason: '',
    searchTime: '01:30',
    elementTime: '',
    faults: '0',
    notes: '',
    placement: 1,
    checkInStatus: 'checked-in',
    isScored: true,
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

// Signed out by default; a signed-in test sets a user.
let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
    isJudge: false,
    isAdmin: false,
    user: mockUser,
  }),
}));

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutate: vi.fn() }),
}));

const mockVisibility = {
  showPlacement: true,
  showQualification: true,
  showTime: true,
  showFaults: true,
  selfCheckinEnabled: false,
  isLoading: false,
};
vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => mockVisibility,
  deriveClassState: () => 'results-released',
}));

let mockViewMode: 'table' | 'cards' = 'table';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, vi.fn()],
  CARD_TABLE_MODES: [
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ],
}));

function makeEntry(id: string, dogName: string): ScentWorkEntry {
  return {
    id,
    displayInfo: {
      armband: id,
      dogName,
      dogBreed: 'Unknown',
      handlerName: 'Handler',
      dogId: `dog-${id}`,
      handlerId: `handler-${id}`,
    },
    classConfig: {} as ScentWorkClassConfig,
    checkInStatus: 'no-status',
  } as ScentWorkEntry;
}

const entries: ScentWorkEntry[] = [makeEntry('e1', 'Rex'), makeEntry('e2', 'Buddy')];

const readOnlyProps: ClassResultsTableProps = {
  entries,
  rawEntries: [],
  classConfig: {} as ScentWorkClassConfig,
  userPermissions: { canEditEntries: false, canViewResults: true } as UserPermissions,
  classId: 'cls-1',
  showId: 'show-1',
  trialId: 'trial-1',
};

const RELEASED = '2026-06-16T00:00:00Z';

const baseRows = mockRows;

// MYK9-2089: the UKC element time shows read-only next to the search time, only when a run has one.
describe('ClassResultsTable element time column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockViewMode = 'table';
  });

  it('shows the column, the formatted value and the export column when a run has an element time', async () => {
    mockRows = baseRows.map(r => ({ ...r, elementTime: r.entryId === 'e2' ? '00:42.50' : '' }));
    const { user } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers.indexOf('Element Time')).toBe(headers.indexOf('Search Time') + 1);
    expect(screen.getByText('00:42.50')).toBeInTheDocument();

    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      const lines = download.csv().split('\n');
      expect(lines[0]).toBe(
        'Armband,Dog,Handler,Placement,Qualification,Search Time,Element Time,Faults,Check-in'
      );
      expect(lines.join('\n')).toContain('00:42.50');
    } finally {
      download.restore();
    }
  });

  it('leaves the column and the export column out when no run has an element time', async () => {
    mockRows = baseRows.map(r => ({ ...r, elementTime: '' }));
    const { user } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('columnheader', { name: 'Element Time' })).not.toBeInTheDocument();

    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      expect(download.csv().split('\n')[0]).toBe(
        'Armband,Dog,Handler,Placement,Qualification,Search Time,Faults,Check-in'
      );
    } finally {
      download.restore();
    }
  });
});
