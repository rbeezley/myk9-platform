import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { useMyEntriesData } from './useMyEntriesData';
import { MyShowsList } from './MyShowsList';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

/**
 * MYK9-1147: an entry in a draft (unpublished) show. The exhibitor cannot read
 * the show row, so the entry arrives with `show: null`. It must stay visible
 * under a plain heading, with no invented show name and no date standing in for
 * the missing one. Driven through the real mapper, grouping and list.
 */
function unreadableShowRow(id: string, dogName: string) {
  return {
    id,
    show_id: 'show-draft',
    dog_id: `dog-${id}`,
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'check',
    entry_fee: 25,
    check_in_status: 'no-status',
    deleted_at: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    registration_id: null,
    dog: { id: `dog-${id}`, name: dogName, call_name: dogName },
    show: null,
    class: { id: `class-${id}`, name: 'Interior Advanced', class_number: '1' },
  };
}

async function loadEntries() {
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    source: 'confirmed',
    data: [unreadableShowRow('e-1', 'Juni')],
    error: null,
  });
  const { result } = renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  return result.current.entries;
}

describe('My Shows: an entry in a show the exhibitor cannot read (MYK9-1147)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  it('carries no show date for the unreadable show', async () => {
    const [entry] = await loadEntries();
    expect(entry?.showDate).toBeUndefined();
  });

  it('renders "Show not published yet" with the dog and the paid line, never Unknown Show or a date', async () => {
    const entries = await loadEntries();
    render(
      <MyShowsList
        filteredEntries={toOrders(entries)}
        source="confirmed"
        seenResultReleaseKeys={new Set<string>()}
        now={NOW}
        onCheckInDay={vi.fn()}
        onOpenCheckIn={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenReceipts={vi.fn()}
        onLeaveClass={vi.fn()}
      />
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Show not published yet' })
    ).toBeInTheDocument();
    expect(screen.getByText('Juni')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Unknown Show/);
    // A date line is "Weekday, Mon D"; none may render for this show.
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    expect(document.body.textContent).not.toContain(today);
    expect(document.body.textContent).not.toMatch(/Invalid Date|NaN/);
  });
});
