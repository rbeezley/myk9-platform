import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';

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

describe('MyEntriesTab', () => {
  it('renders a LiveClassCard for each class entry', () => {
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getByText('Open Standard')).toBeInTheDocument();
  });

  it('shows DogsAheadBadge on each card', () => {
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText('3 dogs ahead')).toBeInTheDocument();
    expect(screen.getByText('8 dogs ahead')).toBeInTheDocument();
  });
});
