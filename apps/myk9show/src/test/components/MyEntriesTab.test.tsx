import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';

let mockViewMode = 'cards';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [
    mockViewMode,
    (m: string) => {
      mockViewMode = m;
    },
  ],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>
        Cards
      </button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>
        Table
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: vi.fn().mockReturnValue({
    entriesByClass: [
      {
        classId: 'c1',
        className: 'Novice JWW',
        dogName: 'Bella',
        armband: '148',
        dogsAhead: 3,
        scored: false,
      },
      {
        classId: 'c2',
        className: 'Open Standard',
        dogName: 'Bella',
        armband: '148',
        dogsAhead: 8,
        scored: false,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

// Mock LiveClassCard to simplify testing
vi.mock('@/components/live/LiveClassCard', () => ({
  LiveClassCard: ({
    classTitle,
    userDogsAhead,
  }: {
    classTitle: string;
    userDogsAhead?: number;
  }) => (
    <div data-testid="live-class-card">
      <span>{classTitle}</span>
      {userDogsAhead !== undefined && <span>{userDogsAhead} dogs ahead</span>}
    </div>
  ),
}));

// Mock EmptyState
vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

// Mock LoadingSkeleton
vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

// Mock useRBAC (needed by MyEntriesTab)
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => false,
  }),
}));

describe('MyEntriesTab', () => {
  beforeEach(() => {
    mockViewMode = 'cards';
  });

  it('renders a LiveClassCard for each class entry', () => {
    render(
      <MemoryRouter>
        <MyEntriesTab showId="show-1" />
      </MemoryRouter>
    );
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getByText('Open Standard')).toBeInTheDocument();
  });

  it('shows DogsAheadBadge on each card', () => {
    render(
      <MemoryRouter>
        <MyEntriesTab showId="show-1" />
      </MemoryRouter>
    );
    expect(screen.getByText('3 dogs ahead')).toBeInTheDocument();
    expect(screen.getByText('8 dogs ahead')).toBeInTheDocument();
  });

  it('renders ViewToggle', () => {
    render(
      <MemoryRouter>
        <MyEntriesTab showId="show-1" />
      </MemoryRouter>
    );
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('renders table view with entry data when mode is table', () => {
    mockViewMode = 'table';
    render(
      <MemoryRouter>
        <MyEntriesTab showId="show-1" />
      </MemoryRouter>
    );
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByText('My Dog')).toBeInTheDocument();
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getAllByText('Bella')).toHaveLength(2);
    expect(screen.getByText('3 ahead')).toBeInTheDocument();
  });

  it('shows Pending status for unscored entries in table', () => {
    mockViewMode = 'table';
    render(
      <MemoryRouter>
        <MyEntriesTab showId="show-1" />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Pending')).toHaveLength(2);
  });
});
