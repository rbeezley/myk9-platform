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

// Read-only viewer (exhibitor): not staff, cannot edit.
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
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
  deriveClassState: () => 'results-released',
}));

vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['table', vi.fn()],
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

describe('ClassResultsTable released-results tab default', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a read-only viewer to the All tab when results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt="2026-06-16T00:00:00Z" />);
    // "Buddy" is scored → only visible on the All/Completed tab, not Pending.
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('stays on Pending for a read-only viewer before results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />);
    // Pending tab hides the scored entry.
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('flips to All when results are released while the page is already open', () => {
    const { rerender } = render(
      <ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />
    );
    // Initially Pending — scored entry hidden.
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();

    // Results get released while open → tab flips to All, scored entry appears.
    rerender(<ClassResultsTable {...readOnlyProps} resultsReleasedAt="2026-06-16T00:00:00Z" />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('does not force the All tab for staff who can edit', () => {
    render(
      <ClassResultsTable
        {...readOnlyProps}
        userPermissions={{ canEditEntries: true, canViewResults: true } as UserPermissions}
        resultsReleasedAt="2026-06-16T00:00:00Z"
      />
    );
    // Staff keep the Pending default — scored entry hidden until they switch tabs.
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
  });
});
