import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';

vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    readPending: false,
    readFailed: false,
    retry: vi.fn(),
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        showName: 'Spring Specialty',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
        status: 'scheduled',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
      ],
    },
  }),
}));

const NOW = new Date('2026-07-08T16:00:00.000Z');

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Poppy',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    handlerId: 'person-1',
    ownerId: 'person-1',
    classes: [
      {
        id: 'entry-1',
        classId: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
        checkInStatus: 'no-status',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    enrollmentTotalAmount: 2500,
    enrollmentPaidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-08T09:00:00.000Z'),
    lastUpdated: new Date('2026-07-08T09:00:00.000Z'),
    armbandNumber: '114',
    ...overrides,
  };
}

function renderDesk(entries: EntryManagementEntry[]) {
  return render(
    <CheckInDesk
      showId="show-1"
      entries={entries}
      loading={false}
      unknown={false}
      onRetry={vi.fn()}
      currentDate={NOW}
    />
  );
}

describe('CheckInDesk money (MYK9-1937)', () => {
  it('shows what a person owes and links to their entry form', () => {
    renderDesk([entry()]);
    const link = within(screen.getByRole('region', { name: 'Alice Martin' })).getByRole('link', {
      name: 'Owes $25.00',
    });
    expect(link).toHaveAttribute('href', '/shows/show-1/entries?registration=reg-1');
  });

  it('shows no money text for someone paid in full', () => {
    renderDesk([
      entry({ paymentStatus: PaymentStatus.PAID_ONLINE, paidAmount: 25, enrollmentPaidAmount: 25 }),
    ]);
    const card = screen.getByRole('region', { name: 'Alice Martin' });
    expect(card).not.toHaveTextContent(/owes|\$/i);
  });

  it('keeps check-in available while a balance is owed', () => {
    renderDesk([entry()]);
    expect(screen.getByRole('button', { name: 'Check in Poppy' })).toBeEnabled();
  });

  it('links to Entries filtered to the person when several forms owe', () => {
    renderDesk([entry(), entry({ id: 'entry-2', dogId: 'dog-2', registrationId: 'reg-2' })]);
    const link = screen.getByRole('link', { name: 'Owes $50.00' });
    expect(link).toHaveAttribute('href', '/shows/show-1/entries?search=Alice+Martin');
  });

  it("shows a client's form on the client's card, not the pro handler's", () => {
    const forPro = (id: string, reg: string, payer: string, name: string) =>
      entry({
        id,
        dogId: id,
        registrationId: reg,
        enrollmentPayerId: payer,
        ownerName: name,
        handlerName: 'Pat Pro',
        handlerPersonName: 'Pat Pro',
        handlerId: 'pro',
        ownerId: payer,
      });
    renderDesk([
      forPro('a', 'reg-a', 'client-a', 'Ann'),
      forPro('b', 'reg-b', 'client-b', 'Bo'),
      entry({ id: 'c', dogId: 'c', registrationId: 'reg-c', handlerId: 'client-a' }),
    ]);
    expect(screen.getByRole('region', { name: 'Pat Pro' })).not.toHaveTextContent(/owes/i);
    expect(
      within(screen.getByRole('region', { name: 'Alice Martin' })).getByRole('link', {
        name: /Owes/,
      })
    ).toBeInTheDocument();
  });

  it('says the amount is not available when the entry form did not load', () => {
    renderDesk([entry({ enrollmentTotalAmount: null, enrollmentPaidAmount: null })]);
    const card = screen.getByRole('region', { name: 'Alice Martin' });
    expect(within(card).getByRole('link', { name: 'Amount not available' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?registration=reg-1'
    );
    expect(card).not.toHaveTextContent(/\$/);
  });

  it('says the amount is not available when the money could not be traced', () => {
    renderDesk([entry({ moneyRootUnresolved: true })]);
    const link = screen.getByRole('link', { name: 'Amount not available' });
    expect(link).toHaveAttribute('href', '/shows/show-1/entries?registration=reg-1');
  });
});
