import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundResultDetail } from '../RefundResultDetail';
import type { SecretaryEntry } from '@/services/database/entries';
import type { ShowRefundAllResult } from '@/features/payments/useShowRefundAll';

const mocks = vi.hoisted(() => ({
  useSecretaryShowEntriesQuery: vi.fn(),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: mocks.useSecretaryShowEntriesQuery,
}));

function entry(
  id: string,
  owner: { first: string; last: string },
  dog: { name: string; callName: string | null }
): SecretaryEntry {
  // Only the fields the name lookup reads; the rest of the row is irrelevant here.
  return {
    id,
    handler: null,
    handler_id: null,
    handler_person: null,
    dog: {
      id: `dog-${id}`,
      name: dog.name,
      call_name: dog.callName,
      breed: null,
      owner: {
        id: `owner-${id}`,
        first_name: owner.first,
        last_name: owner.last,
        email: null,
        auth_user_id: null,
      },
    },
  } as unknown as SecretaryEntry;
}

const LOADED_ENTRIES = [
  entry('skip-1', { first: 'Pat', last: 'Lee' }, { name: 'Ch Rocket Run', callName: 'Rocket' }),
  // Same exhibitor and dog in a second class: the group names them once.
  entry('skip-2', { first: 'Pat', last: 'Lee' }, { name: 'Ch Rocket Run', callName: 'Rocket' }),
  entry('fail-1', { first: 'Sam', last: 'Ortiz' }, { name: 'Blue Moon', callName: null }),
];

const RESULT: ShowRefundAllResult = {
  refunded: [],
  skipped: [
    { entryId: 'skip-1', reason: 'offline_paid' },
    { entryId: 'skip-2', reason: 'offline_paid' },
    { entryId: 'ghost-entry', reason: 'already_refunded' },
  ],
  failed: [{ paymentIntentId: 'pi_bad', entryIds: ['fail-1'], error: 'card_declined' }],
  summary: { intentsRefunded: 0, entriesRefunded: 0, skipped: 3, failed: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSecretaryShowEntriesQuery.mockReturnValue({ data: LOADED_ENTRIES, isPending: false });
});

async function openDetails() {
  const user = userEvent.setup();
  render(<RefundResultDetail result={RESULT} showId="show-7" />);
  await user.click(screen.getByRole('button', { name: /view details/i }));
  return user;
}

describe('RefundResultDetail names (MYK9-1862)', () => {
  it('reads the show entries through the shared staff read', async () => {
    await openDetails();
    expect(mocks.useSecretaryShowEntriesQuery).toHaveBeenCalledWith('show-7', true);
  });

  it('names the exhibitor and dog on skipped groups and failed payments, once per group', async () => {
    await openDetails();

    expect(screen.getAllByText('Pat Lee · Rocket')).toHaveLength(1);
    expect(screen.getByText('Sam Ortiz · Blue Moon')).toBeVisible();
    expect(screen.queryByText(/entry skip-1/i)).toBeNull();
    expect(screen.queryByText(/fail-1/)).toBeNull();
  });

  it('falls back to a plain label for an entry not in the loaded data', async () => {
    await openDetails();
    expect(screen.getByText('An entry not on this device')).toBeVisible();
    expect(screen.queryByText(/ghost-entry/)).toBeNull();
  });

  it('keeps every raw id under Details for support', async () => {
    const user = await openDetails();
    await user.click(screen.getByRole('button', { name: /details for support/i }));

    expect(await screen.findByText('Skipped offline_paid: skip-1, skip-2')).toBeInTheDocument();
    expect(screen.getByText('Skipped already_refunded: ghost-entry')).toBeInTheDocument();
    expect(screen.getByText('pi_bad (fail-1): card_declined')).toBeInTheDocument();
  });

  it('says names are loading rather than claiming the entries are missing', async () => {
    mocks.useSecretaryShowEntriesQuery.mockReturnValue({ data: undefined, isPending: true });
    await openDetails();
    expect(screen.queryByText('An entry not on this device')).toBeNull();
    expect(screen.getAllByText('Looking up names…').length).toBeGreaterThan(0);
  });
});
