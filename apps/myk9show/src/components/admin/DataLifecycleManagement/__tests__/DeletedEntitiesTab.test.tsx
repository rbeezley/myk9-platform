import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DeletedEntitiesTab } from '../DeletedEntitiesTab';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const { mockNot, mockFrom, mockRpc, mockHardDeleteShow, mockHardDeleteUser, mockNotifyError } =
  vi.hoisted(() => {
    const mockNot = vi.fn();
    const mockFrom = vi.fn().mockReturnValue({ select: () => ({ not: mockNot }) });
    const mockRpc = vi.fn();
    const mockHardDeleteShow = vi.fn().mockResolvedValue({ error: null });
    const mockHardDeleteUser = vi.fn().mockResolvedValue({ error: null });
    const mockNotifyError = vi.fn();
    return { mockNot, mockFrom, mockRpc, mockHardDeleteShow, mockHardDeleteUser, mockNotifyError };
  });

vi.mock('@/lib/notifications', () => ({
  notifications: { error: mockNotifyError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

// dogs/shows/classes/people counts come from admin RPCs, not direct selects.
const RPC_TABLE: Record<string, string> = {
  get_deleted_dogs: 'dogs',
  get_deleted_shows: 'shows',
  get_deleted_classes: 'classes',
  get_deleted_people: 'people',
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn().mockReturnValue({ user: { id: 'test-user-id' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/database/shows', () => ({
  getDeletedShows: vi.fn().mockResolvedValue({ data: [], error: null }),
  restoreShow: vi.fn().mockResolvedValue({ error: null }),
  hardDeleteShow: mockHardDeleteShow,
  SHOW_HAS_STRIPE_ORDERS: 'SHOW_HAS_STRIPE_ORDERS',
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
  hardDeleteUser: mockHardDeleteUser,
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
  // RPC-counted types resolve to an array whose length is the configured count.
  mockRpc.mockImplementation((fn: string) => {
    const table = RPC_TABLE[fn];
    const n = table ? (countsMap[table] ?? 0) : 0;
    return Promise.resolve({
      data: Array.from({ length: n }, (_, i) => ({ id: `${table}-${i}` })),
      error: null,
    });
  });
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
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockHardDeleteShow.mockResolvedValue({ error: null });
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

    expect(screen.getByText('Deleted items will appear here for review.')).toBeInTheDocument();
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

  // MYK9-527: the ledger guard's refusal is not transient, so "Please try
  // again" is the wrong advice. Its own message must reach the admin.
  it('renders the Stripe ledger guard message instead of the generic retry advice', async () => {
    mockHardDeleteShow.mockResolvedValue({
      error: {
        code: 'SHOW_HAS_STRIPE_ORDERS',
        message:
          'This show has 3 Stripe orders; refunds and reconciliation still reference them. Resolve or reassign those orders before deleting the show permanently.',
      },
    });
    setCountsPerTable({ shows: 1 });

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('section-show')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete Shows'));
    await waitFor(() => {
      expect(screen.getByText('Permanently Delete Show?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => {
      expect(mockNotifyError).toHaveBeenCalledWith(
        'This show has 3 Stripe orders; refunds and reconciliation still reference them. Resolve or reassign those orders before deleting the show permanently.'
      );
    });
    expect(mockNotifyError).not.toHaveBeenCalledWith(expect.stringContaining('Please try again'));
  });

  it('still shows the generic retry advice for an unrelated delete failure', async () => {
    mockHardDeleteShow.mockResolvedValue({
      error: { code: '40P01', message: 'deadlock detected' },
    });
    setCountsPerTable({ shows: 1 });

    render(<DeletedEntitiesTab />);

    await waitFor(() => {
      expect(screen.getByTestId('section-show')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete Shows'));
    await waitFor(() => {
      expect(screen.getByText('Permanently Delete Show?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => {
      expect(mockNotifyError).toHaveBeenCalledWith(
        "Couldn't permanently delete Show. Please try again."
      );
    });
  });
  // MYK9-750 (#2261 review): a person delete refused by a guard is not a
  // transient failure either. Say what blocks it instead of "try again".
  it.each([
    [
      'the owns-dogs guard',
      { code: 'MK001', message: 'This person still owns 2 live dog(s). Delete those dogs first.' },
      'This person still owns 2 live dog(s). Delete those dogs first.',
    ],
    [
      'a Stripe ledger foreign key',
      {
        code: '23503',
        message:
          'update or delete on table "enrollments" violates foreign key constraint "stripe_orders_enrollment_id_fkey" on table "stripe_orders"',
      },
      'This record has Stripe orders that refunds and reconciliation still reference, so it cannot be permanently deleted. Resolve or reassign those orders first.',
    ],
  ])('renders the person-delete refusal from %s', async (_label, error, expected) => {
    mockHardDeleteUser.mockResolvedValue({ error });
    setCountsPerTable({ people: 1 });

    render(<DeletedEntitiesTab />);
    await waitFor(() => {
      expect(screen.getByTestId('section-person')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delete People'));
    await waitFor(() => {
      expect(screen.getByText('Permanently Delete Person?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => {
      expect(mockNotifyError).toHaveBeenCalledWith(expected);
    });
    expect(mockNotifyError).not.toHaveBeenCalledWith(expect.stringContaining('Please try again'));
  });
});
