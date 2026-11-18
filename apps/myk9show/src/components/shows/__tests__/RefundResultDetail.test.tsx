import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundResultDetail } from '../RefundResultDetail';
import type { SecretaryEntry } from '@/services/database/entries';
import type { RefundNameRow } from '@/services/database/entries/refundEntryNames';
import type { ShowRefundAllResult } from '@/features/payments/useShowRefundAll';

const mocks = vi.hoisted(() => ({
  useSecretaryShowEntriesQuery: vi.fn(),
  getRefundEntryNames: vi.fn(),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: mocks.useSecretaryShowEntriesQuery,
}));

vi.mock('@/services/database/entries/refundEntryNames', () => ({
  getRefundEntryNames: mocks.getRefundEntryNames,
}));

interface Who {
  dogId: string;
  ownerId: string;
  owner: [string, string];
  name: string;
  callName: string | null;
}

function row(id: string, who: Who): RefundNameRow {
  return {
    id,
    handler: null,
    dog: {
      id: who.dogId,
      name: who.name,
      call_name: who.callName,
      owner: { first_name: who.owner[0], last_name: who.owner[1] },
    },
  };
}

function rosterEntry(id: string, who: Who): SecretaryEntry {
  // Only the fields the name lookup reads; the rest of the row is irrelevant here.
  return {
    id,
    handler: null,
    handler_id: null,
    handler_person: null,
    dog: {
      id: who.dogId,
      name: who.name,
      call_name: who.callName,
      breed: null,
      owner: {
        id: who.ownerId,
        first_name: who.owner[0],
        last_name: who.owner[1],
        email: null,
        auth_user_id: null,
      },
    },
  } as unknown as SecretaryEntry;
}

const ROCKET: Who = {
  dogId: 'dog-rocket',
  ownerId: 'pat',
  owner: ['Pat', 'Lee'],
  name: 'Ch Rocket Run',
  callName: 'Rocket',
};
// A different dog with the same owner and call name: must stay its own line.
const OTHER_ROCKET: Who = { ...ROCKET, dogId: 'dog-rocket-2', name: 'Rocket Of Elm Hill' };
const BLUE: Who = {
  dogId: 'dog-blue',
  ownerId: 'sam',
  owner: ['Sam', 'Ortiz'],
  name: 'Blue Moon',
  callName: null,
};

const ROSTER = [
  // One dog in two classes: the same dog and owner ids on both entries.
  rosterEntry('skip-1', ROCKET),
  rosterEntry('skip-2', ROCKET),
  rosterEntry('fail-1', BLUE),
];

const RESULT: ShowRefundAllResult = {
  refunded: [],
  skipped: [
    { entryId: 'skip-1', reason: 'offline_paid' },
    { entryId: 'skip-2', reason: 'offline_paid' },
    { entryId: 'deleted-entry', reason: 'already_refunded' },
    { entryId: 'ghost-entry', reason: 'already_refunded' },
  ],
  failed: [{ paymentIntentId: 'pi_bad', entryIds: ['fail-1'], error: 'card_declined' }],
  summary: { intentsRefunded: 0, entriesRefunded: 0, skipped: 4, failed: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSecretaryShowEntriesQuery.mockReturnValue({
    data: ROSTER,
    isError: false,
    refetch: vi.fn(),
  });
  // A soft-deleted entry the roster does not carry, named by the by-id read.
  mocks.getRefundEntryNames.mockResolvedValue([row('deleted-entry', BLUE)]);
});

async function openDetails(result: ShowRefundAllResult = RESULT) {
  const user = userEvent.setup();
  render(<RefundResultDetail result={result} showId="show-7" />);
  await user.click(screen.getByRole('button', { name: /view details/i }));
  return user;
}

describe('RefundResultDetail names (MYK9-1862)', () => {
  it('reads the roster, then reads online exactly the ids the roster lacks', async () => {
    await openDetails();
    await screen.findByText('Pat Lee · Rocket');
    expect(mocks.useSecretaryShowEntriesQuery).toHaveBeenCalledWith('show-7', true);
    expect(mocks.getRefundEntryNames).toHaveBeenCalledTimes(1);
    expect(mocks.getRefundEntryNames).toHaveBeenCalledWith(['deleted-entry', 'ghost-entry']);
  });

  it('names the exhibitor and dog on skipped groups and failed payments, one dog once', async () => {
    await openDetails();

    expect(await screen.findAllByText('Pat Lee · Rocket')).toHaveLength(1);
    // The failed payment, and the soft-deleted entry the online read named.
    expect(screen.getAllByText('Sam Ortiz · Blue Moon')).toHaveLength(2);
    expect(screen.queryByText(/skip-1|fail-1|deleted-entry/)).toBeNull();
  });

  it('keeps two different dogs that read alike apart by registered name', async () => {
    mocks.useSecretaryShowEntriesQuery.mockReturnValue({
      data: [rosterEntry('a', ROCKET), rosterEntry('b', OTHER_ROCKET)],
      isError: false,
      refetch: vi.fn(),
    });
    await openDetails({
      ...RESULT,
      skipped: [
        { entryId: 'a', reason: 'offline_paid' },
        { entryId: 'b', reason: 'offline_paid' },
      ],
      failed: [],
    });

    expect(await screen.findByText('Pat Lee · Rocket (Ch Rocket Run)')).toBeVisible();
    expect(screen.getByText('Pat Lee · Rocket (Rocket Of Elm Hill)')).toBeVisible();
  });

  it('falls back to a plain label only for an id neither read found', async () => {
    await openDetails();
    expect(await screen.findByText('An entry not on this device')).toBeVisible();
    expect(screen.queryByText(/ghost-entry/)).toBeNull();
  });

  it('keeps every raw id under Details for support', async () => {
    const user = await openDetails();
    await screen.findByText('Pat Lee · Rocket');
    await user.click(screen.getByRole('button', { name: /details for support/i }));

    expect(await screen.findByText('Skipped offline_paid: skip-1, skip-2')).toBeInTheDocument();
    expect(
      screen.getByText('Skipped already_refunded: deleted-entry, ghost-entry')
    ).toBeInTheDocument();
    expect(screen.getByText('pi_bad (fail-1): card_declined')).toBeInTheDocument();
  });

  it('says names are loading rather than claiming the entries are missing', async () => {
    mocks.useSecretaryShowEntriesQuery.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: vi.fn(),
    });
    await openDetails();
    expect(screen.queryByText('An entry not on this device')).toBeNull();
    expect(screen.getAllByText('Looking up names…').length).toBeGreaterThan(0);
    expect(mocks.getRefundEntryNames).not.toHaveBeenCalled();
  });

  it('a failed lookup says so, and Try again re-reads only the names', async () => {
    mocks.getRefundEntryNames.mockRejectedValueOnce(new Error('offline'));
    const user = await openDetails();

    expect(await screen.findByText('Could not look up names.')).toBeVisible();
    expect(screen.queryByText('An entry not on this device')).toBeNull();
    expect(screen.getByText('2 entries not named')).toBeVisible();
    // The roster still names what it has.
    expect(screen.getByText('Pat Lee · Rocket')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.getRefundEntryNames).toHaveBeenCalledTimes(2));
    expect(mocks.getRefundEntryNames).toHaveBeenLastCalledWith(['deleted-entry', 'ghost-entry']);
    expect(await screen.findByText('An entry not on this device')).toBeVisible();
    expect(screen.queryByText('Could not look up names.')).toBeNull();
  });
});
