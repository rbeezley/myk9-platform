import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeletedEntitiesTab } from '../DeletedEntitiesTab';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const { mockNot, mockFrom } = vi.hoisted(() => {
  const mockNot = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ select: () => ({ not: mockNot }) });
  return { mockNot, mockFrom };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn().mockReturnValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/database/shows', () => ({
  getDeletedShows: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreShow: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteShow: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/trials', () => ({
  getDeletedTrials: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreTrial: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteTrial: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/classes', () => ({
  getDeletedClasses: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreClass: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteClass: vi.fn().mockResolvedValue({ error: null }),
  getDeletedEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreEntry: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteEntry: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/dogs', () => ({
  getDeletedDogs: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreDog: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteDog: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/clubs', () => ({
  getDeletedClubs: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreClub: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteClub: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/users', () => ({
  getDeletedUsers: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreUser: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteUser: vi.fn().mockResolvedValue({ error: null }),
}));

// Mock the child component to simplify testing
vi.mock('../DeletedEntitySection', () => ({
  DeletedEntitySection: ({
    config,
    count,
    onRestore,
    onDelete,
  }: {
    config: { type: string; label: string };
    count: number;
    onRestore: (id: string, name: string, type: string) => void;
    onDelete: (id: string, name: string, type: string) => void;
  }) => (
    <div data-testid={`section-${config.type}`} data-count={count}>
      <span>{config.label}</span>
      <button onClick={() => onRestore('test-id', 'Test Name', config.type)}>
        Restore {config.label}
      </button>
      <button onClick={() => onDelete('test-id', 'Test Name', config.type)}>
        Delete {config.label}
      </button>
    </div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Configure mockNot to resolve with specified counts per table name */
function setCountsPerTable(countsMap: Record<string, number>) {
  mockFrom.mockImplementation((table: string) => ({
    select: () => ({
      not: () => Promise.resolve({ count: countsMap[table] ?? 0, error: null }),
    }),
  }));
}

/** All counts zero */
function setAllCountsZero() {
  setCountsPerTable({});
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('DeletedEntitiesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all counts resolve to 0
    mockNot.mockResolvedValue({ count: 0, error: null });
  });

  it('shows loading state initially', () => {
    // Make the count query never resolve so we stay in loading state
    mockNot.mockReturnValue(new Promise(() => {}));

    render(<DeletedEntitiesTab />);

    expect(screen.getByText('Loading trash...')).toBeInTheDocument();
  });

  it('shows empty state when all counts are 0', async () => {
    setAllCountsZero();

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Deleted items will appear here for review.')
    ).toBeInTheDocument();
  });

  it('renders sections for entities with non-zero counts', async () => {
    setCountsPerTable({ shows: 3 });

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('section-show')).toBeInTheDocument();
    });

    // The shows section should have count=3
    expect(screen.getByTestId('section-show').getAttribute('data-count')).toBe('3');

    // Other sections should still render (all with count=0)
    expect(screen.getByTestId('section-trial')).toBeInTheDocument();
    expect(screen.getByTestId('section-class')).toBeInTheDocument();
    expect(screen.getByTestId('section-entry')).toBeInTheDocument();
    expect(screen.getByTestId('section-dog')).toBeInTheDocument();
    expect(screen.getByTestId('section-club')).toBeInTheDocument();
    expect(screen.getByTestId('section-person')).toBeInTheDocument();
  });

  it('shows restore dialog when Restore clicked', async () => {
    setCountsPerTable({ shows: 1 });

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('section-show')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Restore Shows'));

    await waitFor(() => {
      expect(screen.getByText('Restore Show?')).toBeInTheDocument();
    });

    expect(screen.getByText(/restore "Test Name"/i)).toBeInTheDocument();
  });

  it('shows delete dialog when Delete clicked', async () => {
    setCountsPerTable({ shows: 1 });

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('section-show')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete Shows'));

    await waitFor(() => {
      expect(screen.getByText('Permanently Delete Show?')).toBeInTheDocument();
    });

    expect(screen.getByText(/permanently delete "Test Name"/i)).toBeInTheDocument();
  });
});
