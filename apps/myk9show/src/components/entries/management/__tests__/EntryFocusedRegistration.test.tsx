import { describe, expect, it, vi } from 'vitest';
import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';

function entry(
  id: string,
  dogName: string,
  handlerName: string,
  dogId: string
): EntryManagementEntry {
  return {
    id,
    registrationId: 'registration-1',
    entryNumber: id,
    showId: 'show-1',
    dogId,
    dogName,
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName,
    classes: [
      {
        id: `class-entry-${id}`,
        classId: `class-${id}`,
        name: id === 'entry-1' ? 'Container Novice A' : 'Interior Advanced',
        number: id,
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-12T13:42:00Z'),
    lastUpdated: new Date('2026-07-12T13:42:00Z'),
    confirmationNumber: 'MYK9-1001',
  };
}

describe('EntryFocusedRegistration', () => {
  it('keeps registration context while preserving each child Entry handler', () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
      entry('entry-2', 'Bean', 'Jamie Lee', 'dog-2'),
    ])[0]!;

    render(
      <EntryFocusedRegistration
        registration={registration}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onEntryRemoved={vi.fn()}
        onBulkStatusChange={vi.fn()}
        paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
        showCheckInStatus={false}
        matchingEntryIds={new Set(['entry-2'])}
      />
    );

    expect(screen.getByRole('heading', { name: 'Alice Martin' })).toBeInTheDocument();
    expect(screen.getAllByText('Poppy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bean').length).toBeGreaterThan(0);
    expect(screen.getByText('Handler: Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('Handler: Jamie Lee')).toBeInTheDocument();
    expect(screen.getByText('2 entries need review')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /change check-in status/i })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Search match')).toHaveLength(2);
  });

  it('offers an explicit return action in the compact layout', async () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
    ])[0]!;
    const onBack = vi.fn();
    const { user } = render(
      <EntryFocusedRegistration
        registration={registration}
        onBack={onBack}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onEntryRemoved={vi.fn()}
        onBulkStatusChange={vi.fn()}
        paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps Entries, Payment, and Communication and history in stable order', () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
    ])[0]!;

    render(
      <EntryFocusedRegistration
        registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onEntryRemoved={vi.fn()}
        onBulkStatusChange={vi.fn()}
        paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
        onSendDecisionEmail={vi.fn()}
      />
    );

    const entries = screen.getByRole('heading', { name: 'Entries' });
    const payment = screen.getByRole('heading', { name: 'Payment' });
    const communication = screen.getByRole('heading', { name: 'Communication and history' });

    expect(
      entries.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      payment.compareDocumentPosition(communication) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email Exhibitor' })).toBeInTheDocument();
  });

  describe('Add entry for the exhibitor (MYK9-1594)', () => {
    const props = () => ({
      onStatusChange: vi.fn(),
      onCheckInStatusChange: vi.fn(),
      onOpenArmbandDialog: vi.fn(),
      onEntryRemoved: vi.fn(),
      onBulkStatusChange: vi.fn(),
      paymentLedger: { record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' },
    });
    const registration = () =>
      groupEntriesByShowRegistration([
        { ...entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'), ownerId: 'person-alice' },
      ])[0]!;

    it('offers "Add entry for <exhibitor>" in the header menu, opening the wizard on them and returning to this form', async () => {
      const { user } = render(
        <EntryFocusedRegistration registration={registration()} {...props()} />
      );

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      const item = await screen.findByRole('menuitem', { name: 'Add entry for Alice Martin' });

      const href = new URL(item.getAttribute('href') ?? '', 'http://localhost');
      expect(href.pathname).toBe('/secretary/register/show-1');
      expect(href.searchParams.get('exhibitor')).toBe('person-alice');
      expect(href.searchParams.get('returnForm')).toBe('registration-1');
    });

    it('greys it with the reason for a viewer who is not the trial secretary', async () => {
      const { user } = render(
        <TrialSecretaryAccessProvider reason="Trial secretary access only">
          <EntryFocusedRegistration registration={registration()} {...props()} />
        </TrialSecretaryAccessProvider>
      );

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      const item = await screen.findByRole('menuitem', { name: /Add entry for Alice Martin/ });

      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Trial secretary access only');
    });

    it('is not offered on an online-checkout form with no enrollment row to join', async () => {
      const { user } = render(
        <EntryFocusedRegistration
          registration={{ ...registration(), enrollmentId: null }}
          {...props()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      await screen.findByRole('menu');

      expect(screen.queryByRole('menuitem', { name: /Add entry for/ })).toBeNull();
    });

    it('is not offered when the form names no exhibitor to add for', async () => {
      const bare = groupEntriesByShowRegistration([
        entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
      ])[0]!;
      const { user } = render(<EntryFocusedRegistration registration={bare} {...props()} />);

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      await screen.findByRole('menu');

      expect(screen.queryByRole('menuitem', { name: /Add entry for/ })).toBeNull();
    });
  });

  describe('To finish this form', () => {
    const baseProps = () => ({
      onStatusChange: vi.fn(),
      onCheckInStatusChange: vi.fn(),
      onOpenArmbandDialog: vi.fn(),
      onEntryRemoved: vi.fn(),
      onBulkStatusChange: vi.fn(),
      paymentLedger: {
        record: vi.fn().mockResolvedValue(true),
        markPaidOnline: vi.fn().mockResolvedValue(true),
        todayInShowZone: '2026-09-17',
      },
    });
    const accepted = (id: string, dogName: string, dogId: string) => ({
      ...entry(id, dogName, 'Alice Martin', dogId),
      entryStatus: EntryStatus.ACCEPTED,
      rawEntryStatus: 'confirmed',
      armbandNumber: '201',
    });

    it('lists review, payment, armband and registration number, each with its buttons', async () => {
      const props = baseProps();
      const onOpenEditEntry = vi.fn();
      const registration = groupEntriesByShowRegistration([
        entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
        {
          ...accepted('entry-2', 'Bean', 'dog-2'),
          armbandNumber: undefined as unknown as string,
          awaitingRegistrationNumber: true,
        },
      ])[0]!;
      const { user } = render(
        <EntryFocusedRegistration
          {...props}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
          onOpenEditEntry={onOpenEditEntry}
        />
      );

      const list = screen.getByRole('region', { name: 'To finish this form' });
      expect(within(list).getByText('5 to do')).toBeInTheDocument();
      expect(within(list).getByText('1 entry needs review')).toBeInTheDocument();
      expect(within(list).getByText(/due$/)).toBeInTheDocument();
      expect(within(list).getByText('Poppy has no armband')).toBeInTheDocument();
      expect(within(list).getByText('Bean has no armband')).toBeInTheDocument();
      expect(within(list).getByText('Bean needs a registration number')).toBeInTheDocument();

      await user.click(within(list).getByRole('button', { name: 'Accept' }));
      expect(props.onBulkStatusChange).toHaveBeenCalledWith(['entry-1'], EntryStatus.ACCEPTED);
      await user.click(within(list).getByRole('button', { name: 'Reject' }));
      expect(props.onBulkStatusChange).toHaveBeenCalledWith(['entry-1'], EntryStatus.REJECTED);

      await user.click(within(list).getByRole('button', { name: /assign armband to Bean/i }));
      expect(props.onOpenArmbandDialog).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'entry-2' })
      );
      await user.click(within(list).getByRole('button', { name: /add registration number/i }));
      expect(onOpenEditEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'entry-2' }));
    });

    it('collapses to one All set line with the Done summary when nothing is open', () => {
      const registration = groupEntriesByShowRegistration([
        {
          ...accepted('entry-1', 'Poppy', 'dog-1'),
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          paidAmount: 25,
        },
        {
          ...accepted('entry-2', 'Poppy', 'dog-1'),
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          paidAmount: 25,
        },
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{
            ...registration,
            enrollmentId: 'enrollment-1',
            paymentStatus: PaymentStatus.PAID_BY_CHECK,
            paidAmount: 50,
          }}
        />
      );

      expect(screen.getByText('All set.')).toBeInTheDocument();
      expect(
        screen.getByText(/2 accepted · \$50\.00 paid by check · armband 201/)
      ).toBeInTheDocument();
      expect(screen.queryByText(/to do$/)).not.toBeInTheDocument();
      expect(screen.getByText('Paid in full')).toBeInTheDocument();
    });

    it('names what is finished while items remain', () => {
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        />
      );
      expect(screen.getByText('Done: 1 accepted · armband 201')).toBeInTheDocument();
      expect(screen.getByText('1 to do')).toBeInTheDocument();
    });

    it('never says "due" or offers to take money when the money received covers the total', () => {
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
        accepted('entry-2', 'Poppy', 'dog-1'),
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{ ...registration, enrollmentId: 'enrollment-1', paidAmount: 50 }}
        />
      );
      const list = screen.getByRole('region', { name: 'To finish this form' });
      expect(within(list).getByText('Entries still marked unpaid')).toBeInTheDocument();
      expect(within(list).queryByText(/due$/)).not.toBeInTheDocument();
      expect(within(list).queryByRole('button', { name: /^Cash/ })).not.toBeInTheDocument();
      expect(screen.getByText('Paid in full')).toBeInTheDocument();
    });

    it('asks for an armband only for entries headed for the run, never a waitlisted one', () => {
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
        {
          ...entry('entry-2', 'Bean', 'Alice Martin', 'dog-2'),
          entryStatus: EntryStatus.WAITLIST,
          rawEntryStatus: 'waitlist',
        },
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        />
      );
      expect(screen.queryByText('Bean has no armband')).not.toBeInTheDocument();
    });

    it('credits armbands only to accepted entries in the Done line', () => {
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
        {
          ...accepted('entry-2', 'Bean', 'dog-2'),
          entryStatus: EntryStatus.REJECTED,
          rawEntryStatus: 'rejected',
          armbandNumber: '105',
        },
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        />
      );
      expect(screen.getByText(/^Done: 1 accepted · armband 201$/)).toBeInTheDocument();
    });

    it('offers no payment buttons on an online-checkout form (no enrollment row)', () => {
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
      ])[0]!;
      render(
        <EntryFocusedRegistration
          {...baseProps()}
          registration={{ ...registration, enrollmentId: null }}
        />
      );
      const list = screen.getByRole('region', { name: 'To finish this form' });
      expect(within(list).getByText(/due$/)).toBeInTheDocument();
      expect(within(list).queryByRole('button', { name: /Cash/ })).not.toBeInTheDocument();
      expect(within(list).queryByRole('button', { name: /Check/ })).not.toBeInTheDocument();
      expect(
        within(list).queryByRole('button', { name: /More payment options/ })
      ).not.toBeInTheDocument();
    });

    it('Cash... and the Payment badge menu record the same ledger payment', async () => {
      const viaChecklist = baseProps();
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
      ])[0]!;
      const form = { ...registration, enrollmentId: 'enrollment-1' };
      const first = render(<EntryFocusedRegistration {...viaChecklist} registration={form} />);
      await first.user.click(screen.getByRole('button', { name: 'Cash…' }));
      await first.user.click(screen.getByRole('button', { name: 'Confirm' }));
      first.unmount();

      const viaBadge = baseProps();
      const second = render(<EntryFocusedRegistration {...viaBadge} registration={form} />);
      await second.user.click(screen.getByRole('button', { name: 'Change payment' }));
      await second.user.click(await screen.findByRole('menuitem', { name: 'Paid in Full: Cash…' }));
      await second.user.click(screen.getByRole('button', { name: 'Confirm' }));

      const expected = [
        'enrollment-1',
        {
          kind: 'payment',
          method: 'cash',
          amount: null,
          receivedOn: '2026-09-17',
          reference: null,
        },
      ];
      expect(viaChecklist.paymentLedger.record).toHaveBeenCalledTimes(1);
      expect(viaChecklist.paymentLedger.record).toHaveBeenCalledWith(...expected);
      expect(viaBadge.paymentLedger.record).toHaveBeenCalledWith(...expected);
    });

    it('Check... keeps the check number and received-on date; Partial and Online stay reachable', async () => {
      const props = baseProps();
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
      ])[0]!;
      const { user } = render(
        <EntryFocusedRegistration
          {...props}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Check…' }));
      await user.type(screen.getByPlaceholderText('Check number (optional)'), '9');
      await user.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(props.paymentLedger.record).toHaveBeenCalledWith('enrollment-1', {
        kind: 'payment',
        method: 'check',
        amount: null,
        receivedOn: '2026-09-17',
        reference: '9',
      });

      await user.click(screen.getByRole('button', { name: 'More payment options' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Partial Payment…' }));
      expect(screen.getByPlaceholderText('Amount of this payment ($)')).toBeInTheDocument();
    });

    it('Online goes to the server, not the ledger', async () => {
      const props = baseProps();
      const registration = groupEntriesByShowRegistration([
        accepted('entry-1', 'Poppy', 'dog-1'),
      ])[0]!;
      const { user } = render(
        <EntryFocusedRegistration
          {...props}
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'More payment options' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Paid in Full: Online' }));
      expect(props.paymentLedger.markPaidOnline).toHaveBeenCalledWith('enrollment-1');
      expect(props.paymentLedger.record).not.toHaveBeenCalled();
    });
  });

  describe('header menu', () => {
    it('holds Email exhibitor and Accept all / Reject all, and the Entries section has no Actions button', async () => {
      const onBulkStatusChange = vi.fn();
      const onSendDecisionEmail = vi.fn().mockResolvedValue(undefined);
      const registration = groupEntriesByShowRegistration([
        entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
        entry('entry-2', 'Bean', 'Jamie Lee', 'dog-2'),
      ])[0]!;
      const { user } = render(
        <EntryFocusedRegistration
          registration={{ ...registration, enrollmentId: 'enrollment-1' }}
          onStatusChange={vi.fn()}
          onCheckInStatusChange={vi.fn()}
          onOpenArmbandDialog={vi.fn()}
          onEntryRemoved={vi.fn()}
          onBulkStatusChange={onBulkStatusChange}
          onSendDecisionEmail={onSendDecisionEmail}
          paymentLedger={{
            record: vi.fn(),
            markPaidOnline: vi.fn(),
            todayInShowZone: '2026-09-17',
          }}
        />
      );

      expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      expect(await screen.findByRole('menuitem', { name: /Email exhibitor/ })).toBeInTheDocument();
      expect(screen.queryByText(/Add entry for/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('menuitem', { name: 'Accept all' }));
      expect(onBulkStatusChange).toHaveBeenCalledWith(['entry-1', 'entry-2'], EntryStatus.ACCEPTED);

      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      await user.click(await screen.findByRole('menuitem', { name: /Email exhibitor/ }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('omits Email exhibitor when no decision email can be sent', async () => {
      const registration = groupEntriesByShowRegistration([
        entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
      ])[0]!;
      const { user } = render(
        <EntryFocusedRegistration
          registration={registration}
          onStatusChange={vi.fn()}
          onCheckInStatusChange={vi.fn()}
          onOpenArmbandDialog={vi.fn()}
          onEntryRemoved={vi.fn()}
          onBulkStatusChange={vi.fn()}
          paymentLedger={{
            record: vi.fn(),
            markPaidOnline: vi.fn(),
            todayInShowZone: '2026-09-17',
          }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'More actions for Alice Martin' }));
      expect(await screen.findByRole('menuitem', { name: 'Accept all' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Email exhibitor/ })).not.toBeInTheDocument();
    });
  });

  it.each([
    [true, 'moves focus to the heading when it opens on a narrow screen'],
    [false, 'leaves focus alone in the side-by-side layout'],
  ])('focusHeadingOnMount=%s %s', focusHeadingOnMount => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
    ])[0]!;

    render(
      <EntryFocusedRegistration
        registration={registration}
        focusHeadingOnMount={focusHeadingOnMount}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onEntryRemoved={vi.fn()}
        onBulkStatusChange={vi.fn()}
        paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
        showCheckInStatus={false}
      />
    );

    const heading = screen.getByRole('heading', { name: 'Alice Martin' });
    if (focusHeadingOnMount) expect(heading).toHaveFocus();
    else expect(heading).not.toHaveFocus();
  });
});
