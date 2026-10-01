/**
 * MYK9-879 (Codex round 3): after a declared entry moves up, the declaration stays
 * on the original money-bearing entry while the active destination has a different
 * id. The badge reads through the money root, like the fee beside it, so it shows
 * on the destination row.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryListCard } from '../EntryListCard';
import { withEntryManagementMoneyRoots } from '@/features/financial/entryManagementMoneyRoots';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

const cls = (id: string): EntryClass => ({
  id,
  name: `Class ${id}`,
  number: '101',
  fee: 15,
  status: 'entered',
  checkInStatus: 'no-status' as EntryClass['checkInStatus'],
});

function entry(over: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'x',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rocket',
    ownerName: 'Jane',
    ownerEmail: 'j@test.com',
    handlerName: 'Kid',
    classes: [cls('old')],
    totalFee: 15,
    paidAmount: 15,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...over,
  };
}

const props = {
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onEntryRemoved: vi.fn(),
};

describe('junior badge through the money root', () => {
  // The declared root (entries.junior_fee_declared is on THIS row only) and the
  // money-neutral destination that now carries the run.
  const root = entry({ id: 'root', entryStatus: EntryStatus.MOVED });
  const destination = entry({
    id: 'dest',
    classes: [cls('new')],
    totalFee: 0,
    paidAmount: 0,
    movedFromEntryId: 'root',
  });
  const resolved = withEntryManagementMoneyRoots([root, destination]);
  const destRow = resolved.find(e => e.id === 'dest')!;

  it('the resolved destination points at the root', () => {
    expect(destRow.moneyRootEntryId).toBe('root');
  });

  it('shows the badge on the destination row (declaration only on the root id)', () => {
    render(
      <EntryListCard {...props} entries={[destRow]} juniorDeclaredEntryIds={new Set(['root'])} />
    );
    expect(screen.getByText('Junior fee (declared)')).toBeVisible();
  });

  it('shows it when the secretary has filtered to the destination class alone (root not in the list)', () => {
    render(
      <EntryListCard {...props} entries={[destRow]} juniorDeclaredEntryIds={new Set(['root'])} />
    );
    expect(screen.getAllByText('Junior fee (declared)')).toHaveLength(1);
  });

  it('does not show it for a destination whose root was never declared', () => {
    render(
      <EntryListCard {...props} entries={[destRow]} juniorDeclaredEntryIds={new Set(['other'])} />
    );
    expect(screen.queryByText('Junior fee (declared)')).toBeNull();
  });
});
