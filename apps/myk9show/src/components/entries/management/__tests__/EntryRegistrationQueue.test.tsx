import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Stubs window.matchMedia so `useMediaQuery('(min-width: 768px)')` resolves
 * to `matches`. Pass `matches: true` to simulate >=768px (desktop/tablet,
 * non-compact) or `matches: false` to simulate <768px (compact/phone).
 */
function stubMatchMedia(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
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
  let restoreMatchMedia: (() => void) | undefined;

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  describe('desktop layout (viewport >= 768px)', () => {
    it('marks the focused row persistently and shows one primary action', () => {
      restoreMatchMedia = stubMatchMedia(true);
      renderQueue();

      const focused = screen.getByRole('listitem', { name: /alice martin/i });
      expect(focused).toHaveAttribute('aria-current', 'true');
      expect(focused).toHaveAttribute('id', 'entry-registration-registration-1');
      expect(focused.className).toContain('shadow-[inset_4px_0_0');
      expect(screen.getAllByText('Review registration')).toHaveLength(2);
      expect(screen.getAllByText('Needs review')).toHaveLength(2);
      expect(screen.getAllByText('Not paid yet')).toHaveLength(2);
      expect(screen.queryByText('Payment due')).not.toBeInTheDocument();
    });

    it('clicking a row focuses it while its checkbox only changes bulk selection', async () => {
      restoreMatchMedia = stubMatchMedia(true);
      const { user, groups, onFocus, onToggle } = renderQueue();

      await user.click(screen.getByRole('listitem', { name: /priya shah/i }));
      expect(onFocus).toHaveBeenCalledWith(groups[1]);

      await user.click(screen.getByRole('checkbox', { name: /select alice martin/i }));
      expect(onToggle).toHaveBeenCalledWith(groups[0]);
      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it('exposes a registration-level select-all control', async () => {
      restoreMatchMedia = stubMatchMedia(true);
      const { user, onToggleAll } = renderQueue();

      const checkbox = screen.getByRole('checkbox', { name: /select all registrations/i });
      expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
      expect(checkbox).toHaveAttribute('data-indeterminate');
      expect(checkbox.className).toContain('before:-inset-3.5');
      await user.click(checkbox);
      expect(onToggleAll).toHaveBeenCalledTimes(1);
    });

    it('keeps the multi-column grid unchanged at 768px and wider', () => {
      restoreMatchMedia = stubMatchMedia(true);
      renderQueue();

      const focused = screen.getByRole('listitem', { name: /alice martin/i });
      expect(focused.className).toContain('grid-cols-[2.75rem_minmax(9rem');
      expect(focused.className).not.toContain('flex-col');
    });

    it('renders each row exactly once', () => {
      restoreMatchMedia = stubMatchMedia(true);
      renderQueue();

      expect(screen.getAllByText('Alice Martin')).toHaveLength(1);
    });
  });

  describe('compact layout (viewport < 768px)', () => {
    it('stacks row content instead of rendering the multi-column grid', () => {
      restoreMatchMedia = stubMatchMedia(false);
      renderQueue();

      const focused = screen.getByRole('listitem', { name: /alice martin/i });
      expect(focused.className).toContain('flex-col');
      expect(focused.className).not.toContain('grid-cols-[2.75rem_minmax(9rem');
    });

    it('renders each row exactly once (no CSS-hidden duplicate copy)', () => {
      restoreMatchMedia = stubMatchMedia(false);
      renderQueue();

      expect(screen.getAllByText('Alice Martin')).toHaveLength(1);
      expect(screen.getAllByText(/Poppy/)).toHaveLength(1);
    });

    it('does not truncate the exhibitor name or dog summary', () => {
      restoreMatchMedia = stubMatchMedia(false);
      renderQueue();

      const name = screen.getByText('Alice Martin');
      const dogSummary = screen.getByText(/Poppy · 1 Entry/);
      expect(name.className).not.toContain('truncate');
      expect(dogSummary.className).not.toContain('truncate');
    });

    it('keeps select-all reachable via a simplified header', () => {
      restoreMatchMedia = stubMatchMedia(false);
      renderQueue();

      expect(screen.getByRole('checkbox', { name: /select all registrations/i })).toBeVisible();
      expect(screen.getByText('Select all')).toBeInTheDocument();
    });

    it('still exposes the review label and action link per row', () => {
      restoreMatchMedia = stubMatchMedia(false);
      renderQueue();

      expect(screen.getAllByText('Needs review')).toHaveLength(2);
      expect(screen.getAllByText('Review registration')).toHaveLength(2);
    });
  });
});
