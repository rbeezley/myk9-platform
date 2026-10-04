import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
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
    qualification: 'Qualified',
    qualificationReason: '',
    searchTime: '01:30',
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

let mockVisibility = {
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

// MYK9-993: a signed-out visitor has no header Actions menu, so the export is in the result line.
describe('ClassResultsTable guest Export CSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockViewMode = 'table';
    mockVisibility = {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
      selfCheckinEnabled: false,
      isLoading: false,
    };
  });

  async function exportCsv(props: Partial<ClassResultsTableProps> = {}) {
    const { user } = render(
      <ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} {...props} />
    );
    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      return download.csv().split('\n');
    } finally {
      download.restore();
    }
  }

  it('exports exactly the visible columns and rows of the released table', async () => {
    const lines = await exportCsv();
    expect(lines[0]).toBe(
      'Armband,Dog,Handler,Placement,Qualification,Search Time,Faults,Check-in'
    );
    // Both rows show on the All tab, so both are exported.
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).toContain('Rex');
    expect(lines.join('\n')).toContain('Buddy');
  });

  it('leaves out the columns the class hides from the public, values included', async () => {
    mockVisibility = { ...mockVisibility, showPlacement: false, showTime: false };
    const lines = await exportCsv();
    expect(lines[0]).toBe('Armband,Dog,Handler,Qualification,Faults,Check-in');
    expect(lines.join('\n')).not.toContain('01:30');
  });

  it('exports only the rows the search leaves showing', async () => {
    const { user } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    await user.type(screen.getByPlaceholderText(/Search by dog/), 'Buddy');
    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      const lines = download.csv().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Buddy');
    } finally {
      download.restore();
    }
  });

  it('drops Check-in on the Completed tab, where the table has no such column', async () => {
    const { user } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    await user.click(screen.getByRole('combobox', { name: 'Show: Result views' }));
    await user.click(await screen.findByRole('option', { name: /Completed/ }));
    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      expect(download.csv().split('\n')[0]).toBe(
        'Armband,Dog,Handler,Placement,Qualification,Search Time,Faults'
      );
    } finally {
      download.restore();
    }
  });

  it('is in the result line', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    const resultLine = screen.getByRole('status').parentElement as HTMLElement;
    expect(within(resultLine).getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('is absent before results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('is absent in card view, which shows fewer fields than the CSV would carry', () => {
    mockViewMode = 'cards';
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('is absent while the visibility settings are still loading', () => {
    mockVisibility = { ...mockVisibility, isLoading: true };
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('is absent for a signed-in reader, whose header Actions export is unchanged', () => {
    mockUser = { id: 'u1' };
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(registeredPageExports().map(item => item.id)).toEqual(['class-results']);
    resetPageExports();
  });
});
