/**
 * The paid confirmation banner must state the show's FULL paid total and
 * never shift under the When/Status filters (MYK9-804). `paidStripSeen.test.ts`
 * proves the row-level derivation in isolation; this file proves the WIRING —
 * `MyShowsList` always feeds `derivePaidStrip` the account's full, unfiltered
 * order set, even while the visible dog cards below still respect the active
 * filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { PaymentStatus } from '@/types/show-registration-types';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

/** Paid at a fixed instant inside the 14-day confirmation window relative to `NOW`. */
const PAID_AT = new Date('2026-10-20T12:00:00Z');

function paidCls(id: string) {
  return makeClass({
    id,
    fee: 30,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    rawPaymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
  });
}

function unpaidCls(id: string) {
  return makeClass({
    id,
    fee: 30,
    paymentStatus: PaymentStatus.PENDING,
    rawPaymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'online',
  });
}

/**
 * The issue's exact scenario (MYK9-804): 7 paid $30 classes across Cooper,
 * Scout, Willow and Ranger; Ranger, Juni and Maple carry 3 unpaid $30
 * classes — Ranger appears on both sides. One registration per dog, so this
 * fixture isolates the FILTER-independence fix from the row-level fold fix
 * already covered by `paidStripSeen.test.ts`.
 */
function scenarioRows(): MyEntry[] {
  return [
    makeRow({
      id: 'e-cooper',
      registrationId: 'r-cooper',
      dogId: 'd-cooper',
      dogName: 'Cooper',
      submittedAt: PAID_AT,
      classes: [paidCls('c-cooper-hda')],
    }),
    makeRow({
      id: 'e-scout',
      registrationId: 'r-scout',
      dogId: 'd-scout',
      dogName: 'Scout',
      submittedAt: PAID_AT,
      classes: [paidCls('c-scout-cna'), paidCls('c-scout-inb')],
    }),
    makeRow({
      id: 'e-willow',
      registrationId: 'r-willow',
      dogId: 'd-willow',
      dogName: 'Willow',
      submittedAt: PAID_AT,
      classes: [paidCls('c-willow-cna'), paidCls('c-willow-ia'), paidCls('c-willow-iap')],
    }),
    makeRow({
      id: 'e-ranger',
      registrationId: 'r-ranger',
      dogId: 'd-ranger',
      dogName: 'Ranger',
      submittedAt: PAID_AT,
      classes: [paidCls('c-ranger-iap'), unpaidCls('c-ranger-unpaid')],
    }),
    makeRow({
      id: 'e-juni',
      registrationId: 'r-juni',
      dogId: 'd-juni',
      dogName: 'Juni',
      submittedAt: PAID_AT,
      classes: [unpaidCls('c-juni')],
    }),
    makeRow({
      id: 'e-maple',
      registrationId: 'r-maple',
      dogId: 'd-maple',
      dogName: 'Maple',
      submittedAt: PAID_AT,
      classes: [unpaidCls('c-maple')],
    }),
  ];
}

function renderList(overrides: Partial<MyShowsListProps> = {}) {
  const allOrders = toOrders(scenarioRows());
  const props: MyShowsListProps = {
    filteredEntries: allOrders,
    allOrders,
    source: 'confirmed',
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    onLeaveClass: vi.fn(),
    ...overrides,
  };
  return render(<MyShowsList {...props} />);
}

beforeEach(() => {
  localStorage.clear();
});

describe('MyShowsList — paid banner (MYK9-804 exact scenario)', () => {
  it('states $210.00 paid — the sum of all 7 paid classes, across every filter view', () => {
    renderList();

    expect(screen.getByText(/\$210\.00/)).toBeInTheDocument();
  });

  it('states $90.00 due, naming Ranger, Juni and Maple', () => {
    renderList();

    expect(screen.getByText(/Ranger, Juni and Maple/)).toBeInTheDocument();
    expect(
      screen.getByText('$90.00 due · the secretary will review it once it is paid.')
    ).toBeInTheDocument();
  });

  it('does not change when the visible cards are narrowed by a filter', () => {
    const allOrders = toOrders(scenarioRows());
    // Simulate a Status/When filter that only shows Cooper's card below — the
    // paid banner must still report the show's FULL $210, not $30.
    const narrowedFilteredEntries = allOrders.filter(order => order.registrationId === 'r-cooper');

    renderList({ filteredEntries: narrowedFilteredEntries, allOrders });

    expect(screen.getByText(/\$210\.00/)).toBeInTheDocument();
    // The dog cards below DO respect the filter — only Cooper renders.
    expect(screen.queryByText('Ranger')).not.toBeInTheDocument();
  });

  it('reports the identical paid total under a second, differently-narrowed filter view', () => {
    const allOrders = toOrders(scenarioRows());
    const upcomingLikeSubset = allOrders.filter(order =>
      ['r-cooper', 'r-scout', 'r-willow'].includes(order.registrationId ?? '')
    );

    renderList({ filteredEntries: upcomingLikeSubset, allOrders });

    expect(screen.getByText(/\$210\.00/)).toBeInTheDocument();
  });
});
