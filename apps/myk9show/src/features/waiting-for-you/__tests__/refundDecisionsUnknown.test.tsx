/**
 * MYK9-2099: the saved refund decisions are a separate, online-only read. When it fails, a denied
 * refund must not reappear as one to decide: Finish the show and the Pulls list say the decisions
 * could not be loaded, the refund controls are held, and no count is claimed.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildEntryListTools } from '@/components/entries/management/entryManagementViews';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { calculateWhatIsLeft } from '@/features/show-closeout/whatIsLeft';
import { summarizeShowDayReconciliation } from '@/features/show-workbench/showDayReconciliationSummary';
import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { findEntryRefundsToDecide, isPullsListEntry } from '..';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

/** The replicated secretary read, with the saved-decision side-read FAILED (`null`). */
function replicaRow(id: string, entryStatus: string) {
  return toSecretaryEntry(
    {
      id,
      dogId: `dog-${id}`,
      classId: 'class-1',
      showId: 'show-1',
      entryStatus,
      entryFee: 25,
      paymentStatus: 'paid',
      paymentMethod: 'online',
    } as never,
    {
      dogsMap: new Map(),
      classesMap: new Map(),
      armbandsByEntryId: new Map(),
      armbandsByDogId: new Map(),
      peopleMap: new Map(),
      enrollmentsMap: new Map(),
      trialsMap: new Map(),
      pullMetadataMap: null,
    } as unknown as Parameters<typeof toSecretaryEntry>[1]
  );
}

function entry(id: string, over: Partial<EntryManagementEntry>): EntryManagementEntry {
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
    entryStatus: EntryStatus.SCRATCHED,
    rawPaymentStatus: 'paid',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    refundAmount: null,
    refundedAt: null,
    // The server holds 'denied' for each of these; the read that would say so failed.
    refundDecision: null,
    refundDecisionUnknown: true,
    pullTiming: 'after_close',
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
    ...over,
  };
}

const unread = [
  entry('Pulled', { rawEntryStatus: 'scratched' }),
  entry('Removed', { rawEntryStatus: 'withdrawn' }),
  entry('Absent', { rawEntryStatus: 'absent' }),
];

describe('saved refund decisions that could not be read (MYK9-2099)', () => {
  it('marks the read rows unknown and Finish the show claims no count', () => {
    const rows = [replicaRow('a', 'absent'), replicaRow('r', 'withdrawn')];
    expect(rows.every(row => row.refund_decision_unknown === true)).toBe(true);

    const summary = summarizeShowDayReconciliation(rows, null);
    expect(summary.refundReviewCount).toBe(0);
    expect(summary.refundDecisionUnknownCount).toBe(2);

    const left = calculateWhatIsLeft({
      classes: [],
      trials: [],
      entries: rows,
      incidents: null,
      submissions: null,
    });
    const line = left.lines.find(candidate => candidate.kind === 'refund-review');
    expect(line?.count).toBeNull();
    expect(line?.open).toBeNull();
    expect(left.concerns).toContain(
      'Saved refund decisions could not be loaded, so the refunds still to decide are unknown.'
    );
  });

  it('counts none as to decide, keeps them on the Pulls list, and leaves the menu unbadged', () => {
    const list = findEntryRefundsToDecide(unread);
    expect(list.count).toBe(0);
    expect(list.decisionsUnknown).toBe(3);
    expect(unread.every(isPullsListEntry)).toBe(true);

    const tools = buildEntryListTools('show-1', {
      pulls: list.decisionsUnknown > 0 ? undefined : list.count,
      moveUps: undefined,
      registrationNeeded: undefined,
      waitlist: undefined,
    });
    expect(tools.find(tool => tool.id === 'entry-list-pulls')?.attentionLabel).toBeUndefined();
  });

  it('the Pulls list says so and holds Issue refund and Deny refund', () => {
    render(<PullManagementTab processedEntries={unread} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Saved refund decisions couldn't be loaded"
    );
    const issue = screen.getAllByRole('button', { name: /issue refund/i });
    const deny = screen.getAllByRole('button', { name: /deny refund/i });
    expect(issue).toHaveLength(3);
    expect(deny).toHaveLength(3);
    for (const button of [...issue, ...deny]) expect(button).toBeDisabled();
    // No row is presented as decided either way, nor pre-selected.
    for (const button of deny) expect(button).not.toHaveAttribute('aria-pressed', 'true');
  });
});
