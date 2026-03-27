import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => false,
  }),
}));

let mockViewMode = 'table';
const mockSetViewMode = vi.fn((m: string) => {
  mockViewMode = m;
});
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, mockSetViewMode],
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

const mockClasses = [
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
    status: 'in_progress',
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
    status: 'pending',
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
    status: 'pending',
    entryCount: 15,
    userHasEntry: false,
  },
];

// Mock a simple data source — the component will receive classes as props or via hook
// For simplicity, we pass classes as a prop
vi.mock('@/components/common/MineToggle', () => ({
  MineToggle: ({
    isMine,
    onToggle,
    allLabel,
    mineLabel,
  }: {
    isMine: boolean;
    onToggle: () => void;
    allLabel: string;
    mineLabel: string;
  }) => (
    <div data-testid="mine-toggle">
      <button onClick={onToggle}>{isMine ? mineLabel : allLabel}</button>
    </div>
  ),
}));

vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

describe('ClassesTab', () => {
  beforeEach(() => {
    mockViewMode = 'table';
    mockNavigate.mockClear();
    mockSetViewMode.mockClear();
  });

  it('renders a table with class info', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getAllByText('Novice')).toHaveLength(2);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  it('defaults to showing only user classes when user has entries', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).toBeNull();
  });

  it('shows all classes when toggled', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    // Click the toggle (which shows "My Classes" text when isMine=true, clicking switches)
    fireEvent.click(screen.getByText('My Classes'));
    expect(screen.getByText('Exterior')).toBeInTheDocument();
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

  it('MineToggle filters in card view', () => {
    mockViewMode = 'cards';
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
    // Default: isMine=true when userHasEntries, so only 2 cards
    expect(screen.getAllByTestId('class-card')).toHaveLength(2);
    // Toggle to all
    fireEvent.click(screen.getByText('My Classes'));
    expect(screen.getAllByTestId('class-card')).toHaveLength(3);
  });
});
