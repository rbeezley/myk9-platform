import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryRegistrationQueue } from '../EntryRegistrationQueue';

function entry(id: string, registrationId: string, ownerName: string): EntryManagementEntry {
  return {
    id,
    registrationId,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: id === 'entry-1' ? 'Poppy' : 'Bean',
    ownerName,
    ownerEmail: `${ownerName.toLowerCase().replace(' ', '.')}@example.com`,
    handlerName: ownerName,
    classes: [
      {
        id,
        classId: `class-${id}`,
        name: 'Container Novice A',
        number: 'CN-A',
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
    confirmationNumber: registrationId,
  };
}

function renderQueue() {
  const groups = groupEntriesByShowRegistration([
    entry('entry-1', 'registration-1', 'Alice Martin'),
    entry('entry-2', 'registration-2', 'Priya Shah'),
  ]);
  const onFocus = vi.fn();
  const onToggle = vi.fn();
  const onToggleAll = vi.fn();
  const result = render(
    <EntryRegistrationQueue
      groups={groups}
      focusedKey="registration-1"
      selectedKeys={new Set(['registration-1'])}
      allSelected={false}
      partiallySelected={true}
      onFocus={onFocus}
      onToggle={onToggle}
      onToggleAll={onToggleAll}
      rangeStart={1}
      rangeEnd={2}
      total={2}
      pageIndex={0}
      pageCount={1}
      onPageChange={vi.fn()}
    />
  );
  return { ...result, groups, onFocus, onToggle, onToggleAll };
}

describe('EntryRegistrationQueue', () => {
  it('marks the focused row persistently and shows one primary action', () => {
    renderQueue();

    const focused = screen.getByRole('option', { name: /alice martin/i });
    expect(focused).toHaveAttribute('aria-selected', 'true');
    expect(focused).toHaveAttribute('id', 'entry-registration-registration-1');
    expect(focused.className).toContain('shadow-[inset_4px_0_0');
    expect(screen.getAllByText('Review registration')).toHaveLength(2);
    expect(screen.getAllByText('Needs review')).toHaveLength(2);
    expect(screen.getAllByText('Not paid yet')).toHaveLength(2);
    expect(screen.queryByText('Payment due')).not.toBeInTheDocument();
  });

  it('clicking a row focuses it while its checkbox only changes bulk selection', async () => {
    const { user, groups, onFocus, onToggle } = renderQueue();

    await user.click(screen.getByRole('option', { name: /priya shah/i }));
    expect(onFocus).toHaveBeenCalledWith(groups[1]);

    await user.click(screen.getByRole('checkbox', { name: /select alice martin/i }));
    expect(onToggle).toHaveBeenCalledWith(groups[0]);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('exposes a registration-level select-all control', async () => {
    const { user, onToggleAll } = renderQueue();

    const checkbox = screen.getByRole('checkbox', { name: /select all registrations/i });
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    expect(checkbox).toHaveAttribute('data-indeterminate');
    await user.click(checkbox);
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });
});
