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
// Jo placed form 101 for Pat's dogs and has no entry of their own on the show.
const JO: Person = { id: 'jo', first: 'Jo', last: 'Park' };
const KIM: Person = { id: 'kim', first: 'Kim', last: 'Diaz' };

interface Form {
  enrollmentId: string;
  confirmation: string;
  payer: Person | null;
}

const FORM_101: Form = { enrollmentId: 'enr-101', confirmation: 'MK9-000101', payer: JO };
const FORM_102: Form = { enrollmentId: 'enr-102', confirmation: 'MK9-000102', payer: PAT };
const FORM_109: Form = { enrollmentId: 'enr-109', confirmation: 'MK9-000109', payer: KIM };
const ONLINE = { paymentIntent: 'pi_bad' };

type Placement = Form | typeof ONLINE | null;

function rosterEntry(
  id: string,
  dog: { id: string; callName: string; owner: Person },
  form: Placement
): SecretaryEntry {
  // Only the fields the form lookup reads; the rest of the row is irrelevant here.
  const enrollment = form && 'enrollmentId' in form ? form : null;
  return {
    id,
    handler: null,
    handler_id: null,
    handler_person: null,
    registration_id: enrollment?.enrollmentId ?? null,
    stripe_payment_intent_id: form && 'paymentIntent' in form ? form.paymentIntent : null,
    registration: enrollment
      ? {
          id: enrollment.enrollmentId,
          confirmation_number: enrollment.confirmation,
          handler_id: enrollment.payer?.id ?? null,
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

function readRow(id: string, form: Form | typeof ONLINE): RefundEntryFormRow {
  if ('paymentIntent' in form) {
    return {
      id,
      registration_id: null,
      stripe_payment_intent_id: form.paymentIntent,
      registration: null,
    };
  }
  return {
    id,
    registration_id: form.enrollmentId,
    stripe_payment_intent_id: null,
    registration: {
      confirmation_number: form.confirmation,
      payer: form.payer ? { first_name: form.payer.first, last_name: form.payer.last } : null,
    },
  };
}

const ROCKET = { id: 'dog-rocket', callName: 'Rocket', owner: PAT };
const BLUE = { id: 'dog-blue', callName: 'Blue', owner: PAT };
const MAX = { id: 'dog-max', callName: 'Max', owner: SAM };

const ROSTER = [
  // Two dogs on one form, Rocket in two classes.
  rosterEntry('skip-1', ROCKET, FORM_101),
  rosterEntry('skip-2', ROCKET, FORM_101),
  rosterEntry('skip-3', BLUE, FORM_101),
  // An online order: no enrollment, so no form record and no payer to name.
  rosterEntry('fail-1', MAX, ONLINE),
];

const READ = [
  readRow('skip-1', FORM_101),
  readRow('skip-2', FORM_101),
  readRow('skip-3', FORM_101),
  readRow('fail-1', ONLINE),
  // A soft-deleted entry the roster does not carry.
  readRow('deleted-entry', FORM_109),
];

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
  mocks.getRefundEntryForms.mockResolvedValue(READ);
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

const onlySkipped = (...entryIds: string[]): ShowRefundAllResult => ({
  ...RESULT,
  skipped: entryIds.map(entryId => ({ entryId, reason: 'offline_paid' })),
  failed: [],
});

describe('RefundResultDetail entry forms (MYK9-1862)', () => {
  it('names each skipped group and failed payment by its entry form', async () => {
    await openDetails();

    // The soft-deleted entry, placed by the form read.
    expect(await screen.findByText('Form MK9-000109 · Kim Diaz')).toBeVisible();
    // The online order: no form record, so no person, only the dog as secondary text.
    expect(screen.getByText('Entry form')).toBeVisible();
    expect(screen.getByText('(Max)')).toBeVisible();
    expect(screen.queryByText(/Sam Ortiz/)).toBeNull();
    expect(screen.queryByText(/skip-1|fail-1|deleted-entry/)).toBeNull();
  });

  it("names a payer with no entry of their own from the form's own record", async () => {
    await openDetails();

    expect(await screen.findByText('Form MK9-000101 · Jo Park')).toBeVisible();
    // Never the dogs' owner in their place.
    expect(screen.queryByText(/Pat Lee/)).toBeNull();
  });

  it('reads "Form <confirmation>" with no person when the payer is not known', async () => {
    rosterReturns([rosterEntry('a', ROCKET, FORM_102)]);
    mocks.getRefundEntryForms.mockResolvedValue([readRow('a', { ...FORM_102, payer: null })]);
    await openDetails(onlySkipped('a'));

    await waitFor(() => expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Form MK9-000102')).toBeVisible();
    expect(screen.queryByText(/Pat Lee|·/)).toBeNull();
  });

  it('two dogs on one form are one line, the dogs as secondary text', async () => {
    await openDetails();

    expect(await screen.findAllByText('Form MK9-000101 · Jo Park')).toHaveLength(1);
    expect(screen.getByText('(Rocket, Blue)')).toBeVisible();
  });

  it('one dog on two forms is two lines', async () => {
    rosterReturns([rosterEntry('a', ROCKET, FORM_101), rosterEntry('b', ROCKET, FORM_102)]);
    mocks.getRefundEntryForms.mockResolvedValue([readRow('a', FORM_101), readRow('b', FORM_102)]);
    await openDetails(onlySkipped('a', 'b'));

    expect(await screen.findByText('Form MK9-000101 · Jo Park')).toBeVisible();
    expect(screen.getByText('Form MK9-000102 · Pat Lee')).toBeVisible();
    expect(screen.getAllByText('(Rocket)')).toHaveLength(2);
  });

  it('a roster row with incomplete enrollment data is still labelled by its form', async () => {
    // The replica row lost its enrollment link; the form read still has it.
    rosterReturns([rosterEntry('a', ROCKET, FORM_101), rosterEntry('b', BLUE, null)]);
    mocks.getRefundEntryForms.mockResolvedValue([readRow('a', FORM_101), readRow('b', FORM_101)]);
    await openDetails(onlySkipped('a', 'b'));

    expect(await screen.findAllByText('Form MK9-000101 · Jo Park')).toHaveLength(1);
    expect(screen.getByText('(Rocket, Blue)')).toBeVisible();
    expect(screen.queryByText('Entry form')).toBeNull();
  });

  it('reads every result id once, under the show entries key', async () => {
    await openDetails();
    await screen.findByText('Form MK9-000109 · Kim Diaz');
    expect(mocks.useSecretaryShowEntriesQuery).toHaveBeenCalledWith('show-7', true);
    expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(1);
    expect(mocks.getRefundEntryForms).toHaveBeenCalledWith([
      'deleted-entry',
      'fail-1',
      'ghost-entry',
      'skip-1',
      'skip-2',
      'skip-3',
    ]);
  });

  it('falls back to a plain label only for an id neither source found', async () => {
    await openDetails();
    expect(await screen.findByText('An entry not named')).toBeVisible();
    expect(screen.queryByText(/ghost-entry/)).toBeNull();
  });

  it('shows the roster forms at once and "Looking up…" only for the ids not yet placed', async () => {
    mocks.getRefundEntryForms.mockReturnValue(new Promise(() => undefined));
    await openDetails();

    expect(screen.getByText('Form MK9-000101')).toBeVisible();
    expect(screen.getByText('Entry form')).toBeVisible();
    expect(screen.getAllByText('Looking up…')).toHaveLength(1);
  });

  it('a failed lookup says so, and Try again re-runs only the form read', async () => {
    mocks.getRefundEntryForms.mockRejectedValueOnce(new Error('boom'));
    const user = await openDetails();

    expect(await screen.findByText('Could not look up names.')).toBeVisible();
    expect(screen.getByText('2 entries not named')).toBeVisible();
    expect(screen.getByText('Form MK9-000101')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.getRefundEntryForms).toHaveBeenCalledTimes(2));
    expect(mocks.rosterRefetch).not.toHaveBeenCalled();
    expect(await screen.findByText('Form MK9-000101 · Jo Park')).toBeVisible();
    expect(screen.getByText('Form MK9-000109 · Kim Diaz')).toBeVisible();
    expect(screen.queryByText('Could not look up names.')).toBeNull();
  });

  it('a failed lookup with the roster still loading says Looking up, not unnamed', async () => {
    rosterReturns(undefined);
    mocks.getRefundEntryForms.mockRejectedValueOnce(new Error('boom'));
    await openDetails();

    expect(await screen.findByText('Could not look up names.')).toBeVisible();
    expect(screen.queryByText(/not named/)).toBeNull();
    expect(screen.getAllByText('Looking up…').length).toBeGreaterThan(0);
  });

  it('offline says names need a connection, with no spinner and no Try again', async () => {
    act(() => onlineManager.setOnline(false));
    await openDetails();

    expect(await screen.findByText('Names need a connection.')).toBeVisible();
    expect(screen.queryByText('Looking up…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('2 entries not named')).toBeVisible();
    expect(screen.getByText('Form MK9-000101')).toBeVisible();
    expect(mocks.getRefundEntryForms).not.toHaveBeenCalled();
  });

  it('says forms are loading while nothing has placed them, rather than claiming they are missing', async () => {
    rosterReturns(undefined);
    mocks.getRefundEntryForms.mockReturnValue(new Promise(() => undefined));
    await openDetails();
    expect(screen.queryByText(/not named/)).toBeNull();
    expect(screen.getAllByText('Looking up…')).toHaveLength(3);
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
