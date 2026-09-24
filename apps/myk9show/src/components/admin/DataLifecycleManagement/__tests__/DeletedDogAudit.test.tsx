/**
 * MYK9-607 / MYK9-608 end to end through the real tab, the real mapper and the
 * real section, with only the service layer mocked — on the EXACT row shapes
 * `get_deleted_dogs()` and `restore_dog()` return (migration 20260924104100,
 * pinned by supabase/tests/myk9_607_608_dog_delete_audit_restore_test.sql).
 * A field dropped by any hop between the RPC and the rendered row fails here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@/test/utils/testUtils';
import { parseRestoreDogResult } from '@/services/database/dogs/restoreDogResult';
import { DeletedEntitiesTab } from '../DeletedEntitiesTab';

const { mockRpc, mockGetDeletedDogs, mockRestoreDog, mockWarning, mockSuccess } = vi.hoisted(
  () => ({
    mockRpc: vi.fn(),
    mockGetDeletedDogs: vi.fn(),
    mockRestoreDog: vi.fn(),
    mockWarning: vi.fn(),
    mockSuccess: vi.fn(),
  })
);

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: mockSuccess, info: vi.fn(), warning: mockWarning },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({
      select: () => ({ not: () => Promise.resolve({ count: 0, error: null }) }),
    }),
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn().mockReturnValue({ user: { id: 'admin-auth-id' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { emptyList, ok } = vi.hoisted(() => ({
  emptyList: () => vi.fn().mockResolvedValue({ data: [], error: null }),
  ok: () => vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/database/shows', () => ({
  getDeletedShows: emptyList(),
  restoreShow: ok(),
  hardDeleteShow: ok(),
  SHOW_HAS_STRIPE_ORDERS: 'SHOW_HAS_STRIPE_ORDERS',
}));
vi.mock('@/services/database/trials', () => ({
  getDeletedTrials: emptyList(),
  restoreTrial: ok(),
  hardDeleteTrial: ok(),
}));
vi.mock('@/services/database/classes', () => ({
  getDeletedClasses: emptyList(),
  restoreClass: ok(),
  hardDeleteClass: ok(),
}));
vi.mock('@/services/database/entries', () => ({
  getDeletedEntries: emptyList(),
  restoreEntry: ok(),
  hardDeleteEntry: ok(),
}));
vi.mock('@/services/database/clubs', () => ({
  getDeletedClubs: emptyList(),
  restoreClub: ok(),
  hardDeleteClub: ok(),
}));
vi.mock('@/services/database/users', () => ({
  getDeletedUsers: emptyList(),
  restoreUser: ok(),
  hardDeleteUser: ok(),
}));
vi.mock('@/services/database/dogs', () => ({
  getDeletedDogs: mockGetDeletedDogs,
  restoreDog: mockRestoreDog,
  hardDeleteDog: ok(),
}));

// Rows exactly as get_deleted_dogs() returns them.
const FORCED_ROW = {
  id: 'dog-forced',
  name: 'Stranded Formally',
  call_name: 'Stranded',
  breed: 'Beagle',
  deleted_at: '2026-09-24T07:41:00+00:00',
  deleted_by: 'admin-auth-id',
  deleted_by_email: 'admin@example.test',
  deleted_by_name: 'Restore Admin',
  force_delete_audit: {
    logged_at: '2026-09-24T07:41:00.123+00:00',
    actor_name: 'Restore Admin',
    entry_ids: ['entry-paid', 'entry-partial', 'entry-refunded', 'entry-scored'],
    paid_entry_ids: ['entry-paid'],
    stripe_payment_intent_ids: ['pi_myk9608_partial', 'pi_myk9608_refunded', 'pi_myk9608_stranded'],
    // Exactly the `payments` shape the SQL test pins: one object per affected
    // entry, jsonb numerics as numbers, NULL where nothing was recorded. Both
    // refunds read payment_status 'refunded'; only the amounts differ.
    payments: [
      {
        entry_id: 'entry-paid',
        stripe_payment_intent_id: 'pi_myk9608_stranded',
        payment_status: 'paid',
        entry_fee: 35.0,
        refund_amount: null,
      },
      {
        entry_id: 'entry-partial',
        stripe_payment_intent_id: 'pi_myk9608_partial',
        payment_status: 'refunded',
        entry_fee: 35.0,
        refund_amount: 10.0,
      },
      {
        entry_id: 'entry-refunded',
        stripe_payment_intent_id: 'pi_myk9608_refunded',
        payment_status: 'refunded',
        entry_fee: 35.0,
        refund_amount: 35.0,
      },
      {
        entry_id: 'entry-scored',
        stripe_payment_intent_id: null,
        payment_status: 'pending',
        entry_fee: null,
        refund_amount: null,
      },
    ],
    waitlist_rows_removed: 0,
    cart_items_removed: 0,
    refund_issued: false,
  },
};
const ORDINARY_ROW = {
  id: 'dog-ordinary',
  name: 'Ordinary Formally',
  call_name: 'Ordinary',
  breed: 'Whippet',
  deleted_at: '2026-09-24T07:40:00+00:00',
  deleted_by: 'owner-auth-id',
  deleted_by_email: 'owner@example.test',
  deleted_by_name: null,
  force_delete_audit: null,
};
// A tombstone from before deleted_by was stamped: nothing to name.
const LEGACY_ROW = {
  id: 'dog-legacy',
  name: 'Legacy Formally',
  call_name: 'Legacy',
  breed: 'Poodle',
  deleted_at: '2026-06-01T00:00:00+00:00',
  deleted_by: null,
  deleted_by_email: null,
  deleted_by_name: null,
  force_delete_audit: null,
};

async function openDogs() {
  render(<DeletedEntitiesTab />);
  await waitFor(() => expect(screen.getByText('Dogs')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Dogs'));
  await waitFor(() => expect(screen.getByText('Stranded Formally')).toBeInTheDocument());
}

const rowFor = (name: string) =>
  screen.getByText(name).closest('div.flex.items-center.justify-between') as HTMLElement;

describe('Deleted Items — dogs (MYK9-607, MYK9-608)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const rows = [FORCED_ROW, ORDINARY_ROW, LEGACY_ROW];
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === 'get_deleted_dogs' ? rows : [], error: null })
    );
    mockGetDeletedDogs.mockResolvedValue({ data: rows, error: null });
  });

  it('names the deleter for both delete paths and nothing for a legacy row', async () => {
    await openDogs();

    expect(
      within(rowFor('Stranded Formally')).getByText('Restore Admin (admin@example.test)')
    ).toBeInTheDocument();
    expect(within(rowFor('Ordinary Formally')).getByText('owner@example.test')).toBeInTheDocument();
    expect(within(rowFor('Legacy Formally')).queryByText('by')).not.toBeInTheDocument();
  });

  it('shows a force-deleted dog its entries and stranded payments, and an ordinary one nothing', async () => {
    await openDogs();

    const forced = within(rowFor('Stranded Formally'));
    expect(
      forced.getByText(
        'Force-deleted over the paid/scored guard by Restore Admin. The override issued no refund.'
      )
    ).toBeInTheDocument();
    expect(
      forced.getByText(
        'Entries removed (4): entry-paid, entry-partial, entry-refunded, entry-scored'
      )
    ).toBeInTheDocument();
    // Every entry with an intent, as recorded — the partial refund included,
    // the intent-less entry left out, and no "owed" verdict anywhere.
    expect(
      forced.getByText(
        'Payments recorded at delete: pi_myk9608_stranded: $35.00 paid; pi_myk9608_partial: $35.00 paid, $10.00 refunded; pi_myk9608_refunded: $35.00 paid, refunded in full.'
      )
    ).toBeInTheDocument();
    expect(forced.queryByText(/owed|not refunded|outstanding/i)).not.toBeInTheDocument();
    expect(
      forced.getByText(
        'To refund, restore the dog, then refund in myK9 as needed — never in the Stripe dashboard.'
      )
    ).toBeInTheDocument();

    expect(
      within(rowFor('Ordinary Formally')).queryByText(/Force-deleted/)
    ).not.toBeInTheDocument();
  });

  it('warns, instead of a plain success, when a restore could not give a placement back', async () => {
    // Exactly the jsonb restore_dog returned in the SQL test's skip arm.
    mockRestoreDog.mockResolvedValue({
      data: parseRestoreDogResult({
        dog_id: 'dog-forced',
        entries_restored: 2,
        placements_reapplied: 1,
        placements_skipped: [
          {
            entry_id: 'entry-scored',
            class_id: 'class-1',
            class_name: 'Novice Interior',
            final_placement: 1,
          },
        ],
      }),
      error: null,
    });
    await openDogs();

    fireEvent.click(within(rowFor('Stranded Formally')).getByText('Restore'));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mockWarning).toHaveBeenCalledWith(
        'Dog restored, but one placement was not given back because another dog now holds it: 1st in Novice Interior. Ask the secretary to re-check that class.'
      )
    );
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('keeps the plain success toast when every placement came back', async () => {
    mockRestoreDog.mockResolvedValue({
      data: parseRestoreDogResult({
        dog_id: 'dog-ordinary',
        entries_restored: 1,
        placements_reapplied: 0,
        placements_skipped: [],
      }),
      error: null,
    });
    await openDogs();

    fireEvent.click(within(rowFor('Ordinary Formally')).getByText('Restore'));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('Dog restored'));
    expect(mockWarning).not.toHaveBeenCalled();
  });
});
