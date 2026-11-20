/**
 * MYK9-2099: one count of refunds to decide. The Show Desk pill, the Pulls menu row and the Pulls
 * list read `findEntryRefundsToDecide` / `isPullsListEntry`, so the pill's count is the number of
 * rows on the list that still need a decision.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildEntryListTools } from '@/components/entries/management/entryManagementViews';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { computeShowDeskPendingSignals } from '@/features/show-map/showDeskPendingSignals';
import { payoutDayText } from '@/features/show-map/showDeskWaitingSignals';
import type { ShowMapTree } from '@/features/show-map/showMapTypes';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { findEntryRefundsToDecide, isPullsListEntry } from '..';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const tree = { nodesById: {}, rootIds: [], diagnostics: [] } as unknown as ShowMapTree;

function entry(id: string, over: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: id,
    ownerName: 'Owner',
    ownerEmail: '',
    handlerName: 'Handler',
    classes: [{ id, classId: 'c1', name: 'Novice', number: '1', fee: 25, status: 'entered' }],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    rawEntryStatus: 'confirmed',
    rawPaymentStatus: 'paid',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    refundAmount: null,
    refundedAt: null,
    refundDecision: null,
    pullTiming: null,
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
    ...over,
  };
}

const entries: EntryManagementEntry[] = [
  entry('Pulled', { rawEntryStatus: 'scratched', entryStatus: EntryStatus.SCRATCHED }),
  entry('Withdrawn', { rawEntryStatus: 'withdrawn', withdrawalReasonCode: 'in_season' }),
  entry('Removed', { rawEntryStatus: 'withdrawn' }),
  entry('Absent', { rawEntryStatus: 'absent' }),
  // Decided: a denied pull stays on the list (it is the exhibitor's act) but is not counted.
  entry('Denied', {
    rawEntryStatus: 'scratched',
    entryStatus: EntryStatus.SCRATCHED,
    refundDecision: 'denied',
  }),
  // Decided: a denied removal and a refunded no-show leave the list and the count.
  entry('RemovedDenied', { rawEntryStatus: 'withdrawn', refundDecision: 'denied' }),
  entry('AbsentRefunded', { rawEntryStatus: 'absent', refundAmount: 25 }),
  // Not paid online: nothing for a person to decide in the app.
  entry('AbsentCash', { rawEntryStatus: 'absent', paymentMethod: 'cash' }),
  entry('Running'),
];

describe('refunds to decide: the pill, the menu and the Pulls list agree (MYK9-2099)', () => {
  it('counts every undecided paid-online removal and drops the denied and refunded ones', () => {
    const list = findEntryRefundsToDecide(entries);
    expect(list.rows.map(row => [row.entry.id, row.removal])).toEqual([
      ['Pulled', 'pulled'],
      ['Withdrawn', 'withdrawn'],
      ['Removed', 'removed'],
      ['Absent', 'absent'],
    ]);
    expect(list.count).toBe(4);
  });

  it('lists every row it counts, plus the decided exhibitor pull', () => {
    const listed = entries.filter(isPullsListEntry).map(row => row.id);
    expect(listed).toEqual(['Pulled', 'Withdrawn', 'Removed', 'Absent', 'Denied']);
    for (const row of findEntryRefundsToDecide(entries).rows) {
      expect(listed).toContain(row.entry.id);
    }
  });

  it('the pill count equals the Pulls rows needing a decision, and opens Pulls', () => {
    const count = findEntryRefundsToDecide(entries).count;
    const [pill] = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree,
      entries: [],
      currentDate: new Date('2026-11-17T15:00:00Z'),
      waiting: {
        heldEntries: undefined,
        waitlist: null,
        refundsToDecide: { count, payoutDate: '2026-11-19', payoutDateIsExact: true },
      },
    });
    expect(pill?.id).toBe('refunds-to-decide');
    expect(pill?.label).toBe("4 refunds to decide before Thursday's payout");
    expect(pill?.href).toContain('exception=pulls');
    expect(pill?.destinationName).toBe('Pulls');

    render(<PullManagementTab processedEntries={entries.filter(isPullsListEntry)} />);
    const denyButtons = screen.getAllByRole('button', { name: /deny refund/i });
    // A row needing a decision is one whose Deny refund is not already the saved answer.
    const undecided = denyButtons.filter(button => button.getAttribute('aria-pressed') !== 'true');
    expect(undecided).toHaveLength(pill?.count ?? -1);
    for (const words of ['Removed by the secretary', 'Absent']) {
      expect(
        screen.getByText(new RegExp(`^${words} · refund at the club's discretion$`))
      ).toBeInTheDocument();
    }
  });

  it('the Pulls menu row carries the same count', () => {
    const tools = buildEntryListTools('show-1', {
      pulls: findEntryRefundsToDecide(entries).count,
      moveUps: undefined,
      registrationNeeded: undefined,
      waitlist: undefined,
    });
    expect(tools.find(tool => tool.id === 'entry-list-pulls')?.attentionLabel).toBe('4');
  });

  it('shows no pill when nothing is to decide', () => {
    const signals = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree,
      entries: [],
      waiting: {
        heldEntries: undefined,
        waitlist: null,
        refundsToDecide: { count: 0, payoutDate: '2026-11-19' },
      },
    });
    expect(signals.find(signal => signal.id === 'refunds-to-decide')).toBeUndefined();
  });
});

describe('payoutDayText', () => {
  const now = new Date('2026-11-17T15:00:00Z');
  it('names the payout day within a week, its date beyond, and nothing once it has passed', () => {
    expect(payoutDayText('2026-11-17', now, null, true)).toBe(" before today's payout");
    expect(payoutDayText('2026-11-19', now, null, true)).toBe(" before Thursday's payout");
    expect(payoutDayText('2026-11-30', now, null, true)).toBe(' before the Nov 30 payout');
    expect(payoutDayText('2026-11-16', now, null, true)).toBe('');
    expect(payoutDayText(null, now, null, true)).toBe('');
  });

  // MYK9-2172: while the payout brake is on (or not known to be off) the payout waits for release,
  // so the day is the earliest it can go and never a promise.
  it('names the day only as the earliest unless the payout date is known to be exact', () => {
    expect(payoutDayText('2026-11-17', now)).toBe(' before the payout (as early as today)');
    expect(payoutDayText('2026-11-19', now)).toBe(' before the payout (as early as Thursday)');
    expect(payoutDayText('2026-11-30', now)).toBe(' before the payout (as early as Nov 30)');
    expect(payoutDayText('2026-11-16', now)).toBe('');
  });

  it('a pill whose payout date is not known to be exact promises no payout day', () => {
    const [pill] = computeShowDeskPendingSignals({
      showId: 'show-1',
      tree,
      entries: [],
      currentDate: now,
      waiting: {
        heldEntries: undefined,
        waitlist: null,
        refundsToDecide: { count: 2, payoutDate: '2026-11-19' },
      },
    });
    expect(pill?.label).toBe('2 refunds to decide before the payout (as early as Thursday)');
  });

  // 9 pm Wednesday in Chicago is already Thursday in UTC. The show's calendar says the Thursday
  // payout is tomorrow, not today.
  it("reads today on the show's calendar across UTC midnight", () => {
    const wednesdayEvening = new Date('2026-11-19T03:00:00Z');
    expect(payoutDayText('2026-11-19', wednesdayEvening, 'America/Chicago', true)).toBe(
      " before Thursday's payout"
    );
    expect(payoutDayText('2026-11-19', wednesdayEvening, 'UTC', true)).toBe(
      " before today's payout"
    );
  });
});
