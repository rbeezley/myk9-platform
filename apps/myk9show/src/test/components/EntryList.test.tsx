import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EntryList } from '@/components/shows/EntryList';

vi.mock('@/hooks/useClassEntries', () => ({
  useClassEntries: () => ({
    pending: [
      {
        id: 'e1',
        armband: '142',
        dogName: 'Ziggy',
        breed: 'Border Collie',
        handlerName: 'Sarah',
        status: 'in_ring' as const,
        isCurrentUser: false,
        dogsAhead: 0,
        runOrder: 1,
      },
      {
        id: 'e2',
        armband: '145',
        dogName: 'Pepper',
        breed: 'Sheltie',
        handlerName: 'Mary',
        status: 'checked_in' as const,
        isCurrentUser: false,
        dogsAhead: 1,
        runOrder: 2,
      },
      {
        id: 'e3',
        armband: '148',
        dogName: 'Bella',
        breed: 'Aussie',
        handlerName: 'You',
        status: 'checked_in' as const,
        isCurrentUser: true,
        dogsAhead: 2,
        runOrder: 3,
      },
    ],
    completed: [
      {
        id: 'e4',
        armband: '139',
        dogName: 'Max',
        breed: 'Lab',
        handlerName: 'Tom',
        status: 'completed' as const,
        result: 'Q',
        time: '42.3s',
        isCurrentUser: false,
        dogsAhead: 0,
        runOrder: 0,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

// Mock EntryRow to simplify testing
vi.mock('@/components/live/EntryRow', () => ({
  EntryRow: ({
    armband,
    dogName,
    isCurrentUser,
    result,
    time,
  }: {
    armband: string;
    dogName: string;
    isCurrentUser?: boolean;
    result?: string;
    time?: string;
  }) => (
    <div data-testid="entry-row">
      <span>#{armband}</span>
      <span>{dogName}</span>
      {isCurrentUser && <span>YOU</span>}
      {result && <span>{result}</span>}
      {time && <span>{time}</span>}
    </div>
  ),
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

describe('EntryList', () => {
  it('renders Pending and Completed tabs', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('shows pending entries in run order on Pending tab', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText('#142')).toBeInTheDocument();
    expect(screen.getByText('#145')).toBeInTheDocument();
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('highlights user dog with YOU badge', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText('YOU')).toBeInTheDocument();
  });

  it('shows completed entries with results on Completed tab', () => {
    render(<EntryList classId="class-1" />);
    fireEvent.click(screen.getByText(/Completed/));
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('42.3s')).toBeInTheDocument();
  });
});
