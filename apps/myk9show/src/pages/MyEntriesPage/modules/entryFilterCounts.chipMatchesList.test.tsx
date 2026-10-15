/**
 * A status chip's count must equal what clicking it renders. One dog holding
 * an accepted class and a pending class in SEPARATE orders: the list drops the
 * pending order under Accepted, so the chip may not count its class (Codex,
 * PR #3003).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { deriveStatusCounts } from './entryFilterCounts';
import { orderMatchesStatusFilter } from './statusFilterPredicate';
import { MyShowsList } from './MyShowsList';

const NO_POSITIONS = {
  activePositionCount: 0,
  displayedPositionCount: 0,
  isLoadingPositions: false,
  isScoped: false,
};

function twoOrdersOneDog() {
  return toOrders([
    makeRow({
      id: 'order-accepted',
      registrationId: 'r-a',
      classes: [makeClass({ id: 'c-acc', name: 'Container Novice A' })],
    }),
    makeRow({
      id: 'order-pending',
      registrationId: 'r-p',
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      classes: [
        makeClass({
          id: 'c-pend',
          classId: 'class-2',
          name: 'Buried Novice A',
          entryStatus: EntryStatus.PENDING,
          entryStatusKind: 'pending',
          paymentStatus: PaymentStatus.PENDING,
        }),
      ],
    }),
  ]);
}

describe('status chip count equals the rendered rows', () => {
  it('Accepted chip counts 1 and the filtered list renders 1 class row', () => {
    const orders = twoOrdersOneDog();
    const { counts } = deriveStatusCounts(orders, 'all', 'accepted', NOW, NO_POSITIONS);

    render(
      <MyShowsList
        filteredEntries={orders.filter(o => orderMatchesStatusFilter(o, 'accepted'))}
        source="confirmed"
        seenResultReleaseKeys={new Set<string>()}
        now={NOW}
        onCheckInDay={vi.fn()}
        onOpenCheckIn={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenReceipts={vi.fn()}
        onLeaveClass={vi.fn()}
        selectedStatus="accepted"
      />
    );
    const rendered = ['Container Novice A', 'Buried Novice A'].filter(
      name => screen.queryByText(name) !== null
    );

    expect(rendered).toEqual(['Container Novice A']);
    expect(counts.accepted).toBe(rendered.length);
    expect(counts.pending).toBe(1);
  });
});
