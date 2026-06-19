import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntriesTableView, type EntriesTableSelection } from '../EntriesTableView';
import { setupCsvCapture } from '@/test/utils/csvCapture';

const aClass: EntryClass = { id: 'c1', name: 'Novice A', number: '1', fee: 25, status: 'entered' };

function entry(id: string, dogName: string): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName,
    ownerName: 'Owner',
    ownerEmail: 'o@example.com',
    handlerName: 'Handler',
    classes: [aClass],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: 'pending' as EntryManagementEntry['paymentStatus'],
    submittedAt: new Date('2026-06-01'),
    lastUpdated: new Date('2026-06-01'),
  };
}

function makeSelection(overrides: Partial<EntriesTableSelection> = {}): EntriesTableSelection {
  return {
    isSelected: () => false,
    toggleItem: vi.fn(),
    isAllSelected: false,
    isPartiallySelected: false,
    toggleAll: vi.fn(),
    ...overrides,
  };
}

const entries = [entry('e1', 'Willow'), entry('e2', 'Ranger')];

function makeActionProps() {
  return {
    onStatusChange: vi.fn(),
    onCheckInEntry: vi.fn(),
    onOpenArmbandDialog: vi.fn(),
    onOpenCompDialog: vi.fn(),
    onUncompEntry: vi.fn(),
    onRemoveEntry: vi.fn(),
  };
}

describe('EntriesTableView selection column', () => {
  it('renders no select column when selection is not provided', () => {
    render(<EntriesTableView entries={entries} />);
    expect(screen.queryByRole('checkbox', { name: /select all entries/i })).not.toBeInTheDocument();
  });

  it('renders a select-all header and per-row checkboxes when selection is provided', () => {
    render(<EntriesTableView entries={entries} selection={makeSelection()} />);
    expect(screen.getByRole('checkbox', { name: /select all entries/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select willow/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select ranger/i })).toBeInTheDocument();
  });

  it('toggleAll fires from the header checkbox', async () => {
    const toggleAll = vi.fn();
    const { user } = render(
      <EntriesTableView entries={entries} selection={makeSelection({ toggleAll })} />
    );
    await user.click(screen.getByRole('checkbox', { name: /select all entries/i }));
    expect(toggleAll).toHaveBeenCalledTimes(1);
  });

  it('toggleItem fires for the clicked row', async () => {
    const toggleItem = vi.fn();
    const { user } = render(
      <EntriesTableView entries={entries} selection={makeSelection({ toggleItem })} />
    );
    await user.click(screen.getByRole('checkbox', { name: /select willow/i }));
    expect(toggleItem).toHaveBeenCalledTimes(1);
    expect(toggleItem.mock.calls[0]?.[0]).toMatchObject({ id: 'e1' });
  });

  it('clicking a row checkbox does not trigger the row onClick', async () => {
    const onEntryClick = vi.fn();
    const toggleItem = vi.fn();
    const { user } = render(
      <EntriesTableView
        entries={entries}
        onEntryClick={onEntryClick}
        selection={makeSelection({ toggleItem })}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /select willow/i }));
    expect(toggleItem).toHaveBeenCalledTimes(1);
    expect(onEntryClick).not.toHaveBeenCalled();
  });

  it('renders armband as the first data column after selection', () => {
    render(
      <EntriesTableView entries={entries} selection={makeSelection()} {...makeActionProps()} />
    );

    const headers = screen.getAllByRole('columnheader').map(header => header.textContent?.trim());
    expect(headers[1]).toBe('Armband');
  });

  it('renders one row action menu per entry', () => {
    render(
      <EntriesTableView entries={entries} selection={makeSelection()} {...makeActionProps()} />
    );

    expect(screen.getAllByRole('button', { name: /actions for/i })).toHaveLength(entries.length);
  });

  it('renders row actions when only one action handler is provided', () => {
    render(
      <EntriesTableView entries={entries} selection={makeSelection()} onRemoveEntry={vi.fn()} />
    );

    expect(screen.getAllByRole('button', { name: /actions for/i })).toHaveLength(entries.length);
  });

  it('renders filter-aware empty copy when no entries are shown', () => {
    render(<EntriesTableView entries={[]} emptyState="No waitlist entries right now." />);

    expect(screen.getByText('No waitlist entries right now.')).toBeInTheDocument();
    expect(screen.queryByText('No results found.')).not.toBeInTheDocument();
  });

  it('exports readable table values instead of display or sorting internals', async () => {
    const exportEntry = {
      ...entry('e3', 'Juniper'),
      armbandNumber: '315',
      classes: [aClass, { id: 'c2', name: 'Open B', number: '2', fee: 30, status: 'entered' }],
      paymentStatus: PaymentStatus.PAID_ONLINE,
      submittedAt: new Date('2026-06-04T15:30:00.000Z'),
    } satisfies EntryManagementEntry;
    const csvCapture = setupCsvCapture('blob:entries-export');
    try {
      const { user } = render(
        <EntriesTableView
          entries={[exportEntry]}
          emailStatusMap={{
            [exportEntry.registrationId]: {
              id: 'email-1',
              related_id: exportEntry.registrationId,
              status: 'sent',
              created_at: '2026-06-04T15:31:00.000Z',
            },
          }}
        />
      );

      await user.click(screen.getByRole('button', { name: /export csv/i }));

      const csv = await csvCapture.getCsv();
      expect(csv).toContain('315');
      expect(csv).toContain('Juniper');
      expect(csv).toContain('Novice A; Open B');
      expect(csv).toContain(`${EntryStatus.PENDING} / ${PaymentStatus.PAID_ONLINE} / Email: sent`);
      expect(csv).toContain('2026-06-04T15:30:00.000Z');
      expect(csv).not.toContain('[object Object]');
    } finally {
      csvCapture.restore();
    }
  });
});
