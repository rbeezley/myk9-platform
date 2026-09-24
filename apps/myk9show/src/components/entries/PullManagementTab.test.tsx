import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PullManagementTab } from './PullManagementTab';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const reconciledPull: EntryManagementEntry = {
  id: 'entry-pulled',
  registrationId: 'registration-1',
  entryNumber: '#42',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Buddy',
  ownerName: 'Alex Exhibitor',
  ownerEmail: 'alex@example.com',
  handlerName: 'Jane Doe',
  classes: [
    {
      id: 'entry-pulled',
      classId: 'class-1',
      name: 'Novice A',
      number: '110',
      fee: 32,
      status: 'scratched',
    },
  ],
  totalFee: 32,
  paidAmount: 32,
  entryStatus: EntryStatus.SCRATCHED,
  rawEntryStatus: 'scratched',
  paymentStatus: PaymentStatus.PAID_ONLINE,
  paymentMethod: 'online',
  submittedAt: new Date('2026-06-18T10:00:00Z'),
  lastUpdated: new Date('2026-06-18T11:00:00Z'),
  pullReason: 'Dog injured',
  pulledAt: '2026-06-18T11:00:00Z',
  pullTiming: 'before_close',
  refundDecision: null,
};

describe('PullManagementTab — no approval queue (MYK9-609)', () => {
  it("offers no Pending tab and no Approve/Deny: a pull is the exhibitor's own act", () => {
    render(<PullManagementTab processedEntries={[reconciledPull]} />);

    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^deny$/i })).toBeNull();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });
});

describe('PullManagementTab — loading state (Phase 4 skeleton convergence)', () => {
  it('renders the table skeleton (not a spinner) while the entries read is in flight', () => {
    render(<PullManagementTab processedEntries={[]} processedEntriesLoading />);

    expect(screen.getByRole('status', { name: /loading pulled entries/i })).toBeInTheDocument();
    // Section load must be a skeleton, never the old bare spinner.
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('says the entries read failed rather than claiming there are no pulls', () => {
    render(<PullManagementTab processedEntries={[]} processedEntriesUnknown />);

    expect(screen.getByText("Couldn't load this show's entries")).toBeInTheDocument();
    expect(screen.queryByText('No Pulled Entries')).toBeNull();
  });
});

describe('PullManagementTab — processed entry status', () => {
  it('shows pull context and refund reconciliation in the canonical Exceptions surface', () => {
    render(<PullManagementTab processedEntries={[reconciledPull]} />);

    expect(screen.getByText('Dog injured')).toBeInTheDocument();
    expect(screen.getByText('Before close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue refund' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny refund' })).toBeInTheDocument();
  });

  it('renders pulled entries through the shared status grammar', () => {
    const { container } = render(<PullManagementTab processedEntries={[reconciledPull]} />);

    expect(container.querySelector('[data-family="entry"][data-status="pulled"]')).not.toBeNull();
  });

  it('filters the pulled list by search and says when nothing matches', async () => {
    const { user } = render(<PullManagementTab processedEntries={[reconciledPull]} />);

    await user.type(screen.getByPlaceholderText(/search by dog/i), 'zz');

    expect(screen.queryByText('Buddy')).toBeNull();
    expect(screen.getByText('No pulls match your search')).toBeInTheDocument();
  });
});
