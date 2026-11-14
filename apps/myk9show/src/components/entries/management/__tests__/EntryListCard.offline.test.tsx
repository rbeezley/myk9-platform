import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NetworkConnectivityContext } from '@/hooks/useNetworkStatus';
import {
  CHANGE_CLASS_OFFLINE_REASON,
  CHANGE_HANDLER_OFFLINE_REASON,
} from '@/features/show-map/changeClassEligibility';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryListCard } from '../EntryListCard';

vi.mock('@/features/show-map/useChangeClassClasses', () => ({
  useChangeClassClasses: () => [{ id: 'class-1', status: 'not_started' }],
}));

const entry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: '110',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Hazel',
  ownerName: 'Jane Smith',
  ownerEmail: 'jane@example.com',
  handlerName: 'Jane Smith',
  classes: [
    {
      id: 'class-1',
      classId: 'class-1',
      name: 'Novice A',
      number: '101',
      fee: 25,
      status: 'entered',
    },
  ],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-01-01'),
  lastUpdated: new Date('2026-01-01'),
};

function Connection({ isOnline, children }: { isOnline: boolean; children: ReactNode }) {
  return (
    <NetworkConnectivityContext.Provider value={{ isOnline }}>
      {children}
    </NetworkConnectivityContext.Provider>
  );
}

const cardProps = {
  entries: [entry],
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onEntryRemoved: vi.fn(),
};

describe('Entries row menu offline (MYK9-1940 phase 3)', () => {
  it('Change handler is disabled with its reason when offline, and opens the sheet when online', async () => {
    const user = userEvent.setup();
    const onOpenEditEntry = vi.fn();
    const props = { ...cardProps, onOpenEditEntry };

    const offline = render(
      <Connection isOnline={false}>
        <EntryListCard {...props} />
      </Connection>
    );
    await user.click(screen.getByRole('button', { name: 'Actions for Hazel' }));
    const item = await screen.findByRole('menuitem', { name: /Change handler/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent(CHANGE_HANDLER_OFFLINE_REASON);
    await user.click(item);
    expect(onOpenEditEntry).not.toHaveBeenCalled();
    offline.unmount();

    render(
      <Connection isOnline>
        <EntryListCard {...props} />
      </Connection>
    );
    await user.click(screen.getByRole('button', { name: 'Actions for Hazel' }));
    const online = await screen.findByRole('menuitem', { name: /Change handler/ });
    expect(online).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(online);
    expect(onOpenEditEntry).toHaveBeenCalledWith(entry);
  });

  it('Change class is disabled with its reason when offline', async () => {
    const user = userEvent.setup();
    render(
      <Connection isOnline={false}>
        <EntryListCard {...cardProps} />
      </Connection>
    );
    await user.click(screen.getByRole('button', { name: 'Actions for Hazel' }));
    const item = await screen.findByRole('menuitem', { name: /Change class/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent(CHANGE_CLASS_OFFLINE_REASON);
  });
});
