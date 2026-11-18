import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { RefundResultDetail } from '../RefundResultDetail';
import type { SecretaryEntry } from '@/services/database/entries';
import type { RefundEntryFormRow } from '@/services/database/entries/refundEntryForms';
import type { ShowRefundAllResult } from '@/features/payments/useShowRefundAll';

const mocks = vi.hoisted(() => ({
  useSecretaryShowEntriesQuery: vi.fn(),
  getRefundEntryForms: vi.fn(),
  rosterRefetch: vi.fn(),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: mocks.useSecretaryShowEntriesQuery,
}));

vi.mock('@/services/database/entries/refundEntryForms', () => ({
  getRefundEntryForms: mocks.getRefundEntryForms,
}));

interface Person {
  id: string;
  first: string;
  last: string;
}

const PAT: Person = { id: 'pat', first: 'Pat', last: 'Lee' };
const SAM: Person = { id: 'sam', first: 'Sam', last: 'Ortiz' };
const JO: Person = { id: 'jo', first: 'Jo', last: 'Park' };

interface Form {
  enrollmentId: string;
  confirmation: string;
  payer: Person;
}

const FORM_101: Form = { enrollmentId: 'enr-101', confirmation: 'MK9-000101', payer: PAT };
const FORM_102: Form = { enrollmentId: 'enr-102', confirmation: 'MK9-000102', payer: PAT };
// A mail-in form Jo placed for Pat's dog: the payer is not the dog's owner.
const FORM_103: Form = { enrollmentId: 'enr-103', confirmation: 'MK9-000103', payer: JO };

function rosterEntry(
  id: string,
  dog: { id: string; callName: string; owner: Person },
  form: Form | { paymentIntent: string }
): SecretaryEntry {
  // Only the fields the form lookup reads; the rest of the row is irrelevant here.
  return {
    id,
    handler: null,
    handler_id: null,
    handler_person: null,
    registration_id: 'enrollmentId' in form ? form.enrollmentId : null,
    stripe_payment_intent_id: 'paymentIntent' in form ? form.paymentIntent : null,
    registration:
      'enrollmentId' in form
        ? {
            id: form.enrollmentId,
            confirmation_number: form.confirmation,
            handler_id: form.payer.id,
            total_amount: 5000,
          }
        : null,
    dog: {
      id: dog.id,
      name: `Ch ${dog.callName}`,
      call_name: dog.callName,
      breed: null,
      owner: {
        id: dog.owner.id,
        first_name: dog.owner.first,
        last_name: dog.owner.last,
        email: null,
        auth_user_id: null,
      },
    },
  } as unknown as SecretaryEntry;
}

const ROCKET = { id: 'dog-rocket', callName: 'Rocket', owner: PAT };
const BLUE = { id: 'dog-blue', callName: 'Blue', owner: PAT };
const MAX = { id: 'dog-max', callName: 'Max', owner: SAM };
const IVY = { id: 'dog-ivy', callName: 'Ivy', owner: JO };

const ROSTER = [
  // Two dogs on one form, Rocket in two classes.
  rosterEntry('skip-1', ROCKET, FORM_101),
  rosterEntry('skip-2', ROCKET, FORM_101),
  rosterEntry('skip-3', BLUE, FORM_101),
  // An online order: no enrollment, so the dog's owner is the payer.
  rosterEntry('fail-1', MAX, { paymentIntent: 'pi_bad' }),
];

function readRow(id: string, form: Form): RefundEntryFormRow {
  return {
    id,
    handler: null,
    registration_id: form.enrollmentId,
    stripe_payment_intent_id: null,
    registration: {
      confirmation_number: form.confirmation,
      payer: { first_name: form.payer.first, last_name: form.payer.last },
    },
    dog: null,
  };
}

const KIM: Person = { id: 'kim', first: 'Kim', last: 'Diaz' };
const FORM_109: Form = { enrollmentId: 'enr-109', confirmation: 'MK9-000109', payer: KIM };

const RESULT: ShowRefundAllResult = {
  refunded: [],
  skipped: [
    { entryId: 'skip-1', reason: 'offline_paid' },
    { entryId: 'skip-2', reason: 'offline_paid' },
    { entryId: 'skip-3', reason: 'offline_paid' },
    { entryId: 'deleted-entry', reason: 'already_refunded' },
    { entryId: 'ghost-entry', reason: 'already_refunded' },
  ],
  failed: [{ paymentIntentId: 'pi_bad', entryIds: ['fail-1'], error: 'card_declined' }],
  summary: { intentsRefunded: 0, entriesRefunded: 0, skipped: 5, failed: 1 },
};

function rosterReturns(data: SecretaryEntry[] | undefined) {
  mocks.useSecretaryShowEntriesQuery.mockReturnValue({
    data,
    isError: false,
    refetch: mocks.rosterRefetch,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rosterReturns(ROSTER);
  // A soft-deleted entry the roster does not carry, placed on its form by the by-id read.
  mocks.getRefundEntryForms.mockResolvedValue([readRow('deleted-entry', FORM_109)]);
});

afterEach(() => {
  act(() => onlineManager.setOnline(true));
});

async function openDetails(result: ShowRefundAllResult = RESULT) {
  const user = userEvent.setup();
  render(<RefundResultDetail result={result} showId="show-7" />);
  await user.click(screen.getByRole('button', { name: /view details/i }));
  return user;
}

describe('RefundResultDetail entry forms (MYK9-1862)', () => {
  it('names each skipped group and failed payment by its entry form', async () => {
    await openDetails();

    expect(await screen.findByText('Form MK9-000109 · Kim Diaz')).toBeVisible();
    expect(screen.getByText('Form MK9-000101 · Pat Lee')).toBeVisible();
    // The online order has no confirmation number; its payer is the dog's owner.
    expect(screen.getByText('Entry form · Sam Ortiz')).toBeVisible();
    expect(screen.getByText('(Max)')).toBeVisible();
    expect(screen.queryByText(/skip-1|fail-1|deleted-entry/)).toBeNull();
  });

  it('two dogs on one form are one line, the dogs as secondary text', async () => {
    await openDetails();

    expect(await screen.findAllByText('Form MK9-000101 · Pat Lee')).toHaveLength(1);
    expect(screen.getByText('(Rocket, Blue)')).toBeVisible();
  });

  it('one dog on two forms is two lines', async () => {
    rosterReturns([rosterEntry('a', ROCKET, FORM_101), rosterEntry('b', ROCKET, FORM_102)]);
    await openDetails({
      ...RESULT,
      skipped: [
        { entryId: 'a', reason: 'offline_paid' },
        { entryId: 'b', reason: 'offline_paid' },
      ],
      failed: [],
    });

    expect(await screen.findByText('Form MK9-000101 · Pat Lee')).toBeVisible();
    expect(screen.getByText('Form MK9-000102 · Pat Lee')).toBeVisible();
    expect(screen.getAllByText('(Rocket)')).toHaveLength(2);
  });

  it("names the form's payer, not the dog's owner, as the Check-in desk does", async () => {
    // Jo placed form 103 for Pat's dog; Jo's own dog is on the desk, so the desk knows Jo's name.
    rosterReturns([rosterEntry('a', ROCKET, FORM_103), rosterEntry('jo-own', IVY, FORM_102)]);
    await openDetails({
      ...RESULT,
      skipped: [{ entryId: 'a', reason: 'offline_paid' }],
      failed: [],
    });

    expect(await screen.findByText('Form MK9-000103 · Jo Park')).toBeVisible();
    expect(screen.queryByText(/MK9-000103 · Pat Lee/)).toBeNull();
  });

  it('reads online exactly the ids the roster lacks, under the show entries key', async () => {
    await openDetails();
    await screen.findByText('Form MK9-000109 · Kim Diaz');
    expect(mocks.useSecretaryShowEntriesQuery).toHaveBeenCalledWith('show-7', true);
    expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(1);
    expect(mocks.getRefundEntryForms).toHaveBeenCalledWith(['deleted-entry', 'ghost-entry']);
  });

  it('a soft-deleted entry on a form the roster names joins that form line', async () => {
    mocks.getRefundEntryForms.mockResolvedValue([
      { ...readRow('deleted-entry', FORM_101), registration: null },
    ]);
    await openDetails({
      ...RESULT,
      skipped: [
        { entryId: 'skip-1', reason: 'offline_paid' },
        { entryId: 'deleted-entry', reason: 'offline_paid' },
      ],
      failed: [],
    });

    await waitFor(() => expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByText('Form MK9-000101 · Pat Lee')).toHaveLength(1);
    expect(screen.queryByText(/not named|Looking up/)).toBeNull();
  });

  it('falls back to a plain label only for an id neither read found', async () => {
    await openDetails();
    expect(await screen.findByText('An entry not named')).toBeVisible();
    expect(screen.queryByText(/ghost-entry/)).toBeNull();
  });

  it('shows known forms at once and "Looking up…" only for the ids still being read', async () => {
    mocks.getRefundEntryForms.mockReturnValue(new Promise(() => undefined));
    await openDetails();

    expect(screen.getByText('Form MK9-000101 · Pat Lee')).toBeVisible();
    expect(screen.getByText('Entry form · Sam Ortiz')).toBeVisible();
    expect(screen.getAllByText('Looking up…')).toHaveLength(1);
  });

  it('a failed lookup says so, and Try again re-reads only the missing ids', async () => {
    mocks.getRefundEntryForms.mockRejectedValueOnce(new Error('boom'));
    const user = await openDetails();

    expect(await screen.findByText('Could not look up names.')).toBeVisible();
    expect(screen.getByText('2 entries not named')).toBeVisible();
    expect(screen.getByText('Form MK9-000101 · Pat Lee')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(2));
    expect(mocks.getRefundEntryForms).toHaveBeenLastCalledWith(['deleted-entry', 'ghost-entry']);
    expect(mocks.rosterRefetch).not.toHaveBeenCalled();
    expect(await screen.findByText('Form MK9-000109 · Kim Diaz')).toBeVisible();
    expect(screen.queryByText('Could not look up names.')).toBeNull();
  });

  it('offline says names need a connection, with no spinner and no Try again', async () => {
    act(() => onlineManager.setOnline(false));
    await openDetails();

    expect(await screen.findByText('Names need a connection.')).toBeVisible();
    expect(screen.queryByText('Looking up…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('2 entries not named')).toBeVisible();
    expect(screen.getByText('Form MK9-000101 · Pat Lee')).toBeVisible();
    expect(mocks.getRefundEntryForms).not.toHaveBeenCalled();
  });

  it('says forms are loading while the roster is, rather than claiming entries are missing', async () => {
    rosterReturns(undefined);
    await openDetails();
    expect(screen.queryByText(/not named/)).toBeNull();
    expect(screen.getAllByText('Looking up…')).toHaveLength(3);
    expect(mocks.getRefundEntryForms).not.toHaveBeenCalled();
  });

  it('keeps every raw id under Details for support', async () => {
    const user = await openDetails();
    await screen.findByText('Form MK9-000109 · Kim Diaz');
    await user.click(screen.getByRole('button', { name: /details for support/i }));

    expect(
      await screen.findByText('Skipped offline_paid: skip-1, skip-2, skip-3')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Skipped already_refunded: deleted-entry, ghost-entry')
    ).toBeInTheDocument();
    expect(screen.getByText('pi_bad (fail-1): card_declined')).toBeInTheDocument();
  });
});
