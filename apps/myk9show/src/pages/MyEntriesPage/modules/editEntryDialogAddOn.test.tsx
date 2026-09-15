/**
 * MYK9-536, last hop: the Edit Entry dialog must list BOTH classes of an
 * enrollment that gained one after it was paid.
 *
 * LESSONS `last-hop-drop`. `MyEntriesDialogs.tsx` does not hand the card's
 * `classes` to `EntryEditDialog` — it builds a hand-picked `.map` projection of
 * it, naming each field it forwards. A unit assertion on the card cannot see a
 * field dropped in that projection, and neither can a test that stubs the
 * dialog. So this renders the REAL `EditEntryDialog` on the REAL output of
 * `groupEntriesByOrder`, via the project's own `toOrders` fixture helper.
 *
 * Why this lives apart from `paidEnrollmentAddOn.test.tsx`: that file stubs
 * `@/services/database/entries` with a hand-picked factory exporting only
 * `getUserEntries`, which is all the hook it drives needs. `EntryEditDialog`
 * calls `canModifyEntry` from that same module in an effect, so under that
 * factory it is `undefined`, the effect throws, and React unmounts the tree —
 * leaving an EMPTY DOCUMENT with no failing render and no warning. (A partial
 * module factory is a sharper version of LESSONS `last-hop-drop`: what it omits
 * does not fail loudly, it fails silently in an effect.) Rather than widen that
 * file's factory and couple two unrelated concerns, the dialog gets its own
 * file with the mocks the dialog actually needs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentStatus } from '@/types/show-registration-types';
import { makeClass, makeRow, toOrders } from '@/test/fixtures/myShowsFixtures';

const entryServiceMocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn().mockResolvedValue({ canModify: true }),
  updateEntryDetails: vi.fn().mockResolvedValue({ error: null }),
  updateEntryHandler: vi.fn().mockResolvedValue({ error: null }),
  withdrawEntry: vi.fn().mockResolvedValue({ error: null }),
}));

// The dialog only renders its class list once canModifyEntry resolves true.
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: entryServiceMocks.canModifyEntry,
  updateEntryDetails: entryServiceMocks.updateEntryDetails,
  updateEntryHandler: entryServiceMocks.updateEntryHandler,
  withdrawEntry: entryServiceMocks.withdrawEntry,
}));

// Presence is a realtime concern the dialog only rides; stub the boundary so
// this stays a rendering test and opens no channel.
vi.mock('@/features/show-presence/ShowPresenceProvider', () => ({
  ShowPresenceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { EditEntryDialog } from './MyEntriesDialogs';

const ENROLLMENT_ID = '4b9132b4-64d1-4012-8663-7ec6820a442b';

/**
 * The reported enrollment: the secretary took $30 cash for Interior Advanced,
 * then the exhibitor added Vehicle Advanced by check. Two rows, one
 * registration id — exactly what `getUserEntries` returns and
 * `groupEntriesByOrder` folds into one card.
 */
function paidEnrollmentWithAddOn() {
  const shared = {
    registrationId: ENROLLMENT_ID,
    showId: 'dededede-0000-0000-0000-000000000011',
    showName: 'Heartland UKC Nosework Trial',
    dogId: 'dog-ranger',
    dogName: 'Ranger',
    totalFee: 30,
  };

  return toOrders([
    makeRow({
      ...shared,
      id: 'entry-interior-advanced',
      paymentStatus: PaymentStatus.PAID_BY_CASH,
      classes: [
        makeClass({
          id: 'entry-interior-advanced',
          classId: 'class-interior-advanced',
          name: 'Interior Advanced',
          number: '201',
          fee: 30,
          paymentStatus: PaymentStatus.PAID_BY_CASH,
          paymentMethod: 'cash',
        }),
      ],
    }),
    makeRow({
      ...shared,
      id: 'entry-vehicle-advanced',
      paymentStatus: PaymentStatus.PENDING,
      classes: [
        makeClass({
          id: 'entry-vehicle-advanced',
          classId: 'class-vehicle-advanced',
          name: 'Vehicle Advanced',
          number: '202',
          fee: 30,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'check',
        }),
      ],
    }),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  entryServiceMocks.canModifyEntry.mockResolvedValue({ canModify: true });
});

describe('EditEntryDialog — a class added to a paid enrollment (MYK9-536)', () => {
  it('folds the two rows into one card', () => {
    const orders = paidEnrollmentWithAddOn();

    expect(orders).toHaveLength(1);
    expect(orders[0].registrationId).toBe(ENROLLMENT_ID);
    expect(orders[0].classes.map(cls => cls.name)).toEqual([
      'Interior Advanced',
      'Vehicle Advanced',
    ]);
  });

  it('lists BOTH classes through the dialog projection', async () => {
    const [order] = paidEnrollmentWithAddOn();

    render(
      <EditEntryDialog dialog={{ open: true, entry: order }} onClose={vi.fn()} onUpdate={vi.fn()} />
    );

    // The name and its class number are two text nodes in one element, so match
    // the element's whole text — that also pins the `number` field the
    // projection forwards separately from `name`.
    expect(await screen.findByText(/Interior Advanced #201/)).toBeInTheDocument();
    expect(screen.getByText(/Vehicle Advanced #202/)).toBeInTheDocument();
    // Both fees survive the projection too, so the dialog cannot quietly show
    // one class's money for the order.
    expect(screen.getAllByText('$30.00')).toHaveLength(2);
  });

  it('still lists the add-on when it is the only unpaid class', async () => {
    const [order] = paidEnrollmentWithAddOn();
    // Sanity on the fixture itself: the card really does carry mixed statuses,
    // so the assertion above is not passing on two identical rows.
    expect(order.classes.map(cls => cls.paymentStatus)).toEqual([
      PaymentStatus.PAID_BY_CASH,
      PaymentStatus.PENDING,
    ]);

    render(
      <EditEntryDialog dialog={{ open: true, entry: order }} onClose={vi.fn()} onUpdate={vi.fn()} />
    );

    expect(await screen.findByText(/Vehicle Advanced #202/)).toBeInTheDocument();
  });
});
