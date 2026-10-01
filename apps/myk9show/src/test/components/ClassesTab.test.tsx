import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassesTab, type ClassInfo } from '@/components/shows/tabs/ClassesTab';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: false }),
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => false,
  }),
}));

let mockViewMode = 'table';
let mockHasStoredViewPreference = false;
const mockSetViewMode = vi.fn((m: string) => {
  mockViewMode = m;
});
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, mockSetViewMode, mockHasStoredViewPreference],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>
        Cards
      </button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>
        Table
      </button>
      <span data-testid="active-view">{active}</span>
    </div>
  ),
}));

vi.mock('@/components/shows/tabs/ClassCard', () => ({
  ClassCard: ({
    classInfo,
    onClick,
  }: {
    classInfo: { element: string; level: string };
    onClick?: () => void;
  }) => (
    <div data-testid="class-card" onClick={onClick}>
      <span>{classInfo.element}</span>
      <span>{classInfo.level}</span>
    </div>
  ),
}));

const mockClasses: ClassInfo[] = [
  {
    id: 'c1',
    name: 'Novice Containers',
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: 'Test Judge',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'In Progress',
    entryCount: 28,
    userHasEntry: true,
  },
  {
    id: 'c2',
    name: 'Novice Interior',
    element: 'Interior',
    level: 'Novice',
    section: '',
    judgeName: 'Test Judge',
    trialId: 't1',
    time: '10:30 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 22,
    userHasEntry: true,
  },
  {
    id: 'c3',
    name: 'Advanced Exterior',
    element: 'Exterior',
    level: 'Advanced',
    section: '',
    judgeName: 'Test Judge',
    trialId: 't1',
    time: '1:00 PM',
    ring: 2,
    status: 'Scheduled',
    entryCount: 15,
    userHasEntry: false,
  },
];

vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

describe('ClassesTab', () => {
  beforeEach(() => {
    mockViewMode = 'table';
    mockHasStoredViewPreference = false;
    mockNavigate.mockClear();
    mockSetViewMode.mockClear();
  });

  it('renders a table with class info', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getAllByText('Novice')).toHaveLength(2);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  // Oct 10 rehearsal (MYK9-811): the tab opened on "My Classes" for a
  // secretary who also held entries in the show, hiding the rest of it. The
  // default view must always be "All", whether or not the signed-in user has
  // entries.
  it('defaults to the whole show even when the signed-in user has entries', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  it('scopes to entered classes only after explicitly selecting the Mine view', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).toBeNull();
  });

  it('hides the Mine view when the signed-in user has no entries in the show', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.queryByRole('button', { name: /^Mine/ })).not.toBeInTheDocument();
  });

  it('shows empty state when no classes', () => {
    render(<ClassesTab classes={[]} showId="s1" userHasEntries={false} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders ViewToggle', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('renders table view by default (table headers visible)', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByText('Element')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });

  it('renders card view when viewMode is cards', () => {
    mockViewMode = 'cards';
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getAllByTestId('class-card')).toHaveLength(3);
    expect(screen.queryByText('Element')).not.toBeInTheDocument();
  });

  it('Mine view filters in card view', () => {
    mockViewMode = 'cards';
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    expect(screen.getAllByTestId('class-card')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    expect(screen.getAllByTestId('class-card')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getAllByTestId('class-card')).toHaveLength(3);
  });
});
