/**
 * Smoke tests for `EntryListHeader` (PR E2d-2b).
 *
 * Scope: layout slot pass-through, popover-on-click when classInfo
 * has extra info. The internal primitives (sync
 * indicators, etc.) are stubbed — the test verifies the page wires
 * the slots correctly, not the primitives themselves. Uses vanilla
 * vitest assertions.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { ClassInfo } from '../hooks/useEntryListData';
import type {
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ClassDetailsPopoverProps,
} from '../pageProps';
import { EntryListHeader, type EntryListHeaderProps } from './EntryListHeader';

const StubOffline: ComponentType<CompactOfflineIndicatorProps> = () => (
  <span data-testid="offline" />
);
const StubSync: ComponentType<SyncIndicatorProps> = ({ status, pendingCount }) => (
  <span data-testid="sync" data-status={status} data-pending={String(pendingCount ?? '')} />
);
const StubRefresh: ComponentType<RefreshIndicatorProps> = ({ isRefreshing }) => (
  <span data-testid="refresh" data-refreshing={String(isRefreshing)} />
);
const StubFilter: ComponentType<FilterTriggerButtonProps> = ({ onClick, hasActiveFilters }) => (
  <button data-testid="filter" data-has-active={String(hasActiveFilters)} onClick={onClick} />
);
const StubPopover: ComponentType<ClassDetailsPopoverProps> = ({ isOpen, data }) =>
  isOpen ? (
    <div
      data-testid="popover"
      data-class-id={String(data.classId)}
      data-time-limit={String(data.timeLimitSeconds)}
      data-time-limit-type={typeof data.timeLimitSeconds}
      data-status-label={data.statusLabel ?? ''}
    >
      {data.judgeName ?? ''}
    </div>
  ) : null;

const baseClassInfo: ClassInfo = {
  className: 'Container Novice A',
  classStatus: 'in_progress',
  trialDate: '2026-05-28',
  trialNumber: '1',
  element: 'Container',
  level: 'Novice',
  totalEntries: 10,
  completedEntries: 4,
  selfCheckin: true,
  areas: 1,
  visibilityPreset: 'open',
} as unknown as ClassInfo;

const defaultProps: EntryListHeaderProps = {
  classInfo: baseClassInfo,
  isRefreshing: false,
  isSyncing: false,
  hasError: false,
  hasActiveFilters: false,
  onFilterClick: vi.fn(),
  onRefresh: vi.fn(),
  up: { label: 'Classes', to: '/at-show/show-1' },
  actionsMenu: {
    showRunOrder: false,
    showRecalculatePlacements: false,
    showClassSettings: false,
    onRunOrderClick: vi.fn(),
    onRecalculatePlacements: vi.fn() as () => Promise<void>,
    onClassSettingsClick: vi.fn(),
    printOptions: [],
  },
  CompactOfflineIndicator: StubOffline,
  SyncIndicator: StubSync,
  RefreshIndicator: StubRefresh,
  FilterTriggerButton: StubFilter,
  ClassDetailsPopover: StubPopover,
};

const renderHeader = (override: Partial<EntryListHeaderProps> = {}) =>
  render(
    <MemoryRouter>
      <EntryListHeader {...defaultProps} {...override} />
    </MemoryRouter>
  );

describe('EntryListHeader', () => {
  it('shows the Up control with the parent name and goes to its fixed route', () => {
    render(
      <MemoryRouter initialEntries={['/at-show/show-1/class/c1']}>
        <Routes>
          <Route path="/at-show/show-1/class/c1" element={<EntryListHeader {...defaultProps} />} />
          <Route path="/at-show/show-1" element={<div data-testid="show-page" />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Classes' }));
    expect(screen.getByTestId('show-page')).toBeInTheDocument();
  });

  // MYK9-704: wizard trials store the name in trial_number too.
  it('labels the trial with its stored name, never prefixing "Trial "', () => {
    renderHeader({
      classInfo: {
        ...baseClassInfo,
        trialName: 'Saturday T 2',
        trialNumber: 'Saturday T 2',
      } as ClassInfo,
    });
    const header = document.querySelector('header')!;
    expect(header.textContent).toContain('Saturday T 2');
    expect(header.textContent).not.toMatch(/Trial Saturday|Trial Trial/);
  });

  it('renders the class name in title case', () => {
    renderHeader();
    const heading = screen.getByRole('heading');
    expect(heading.textContent).toMatch(/Container Novice A/);
  });

  it('shows a "waiting to sync" indicator with the count when idle with a queue', () => {
    renderHeader({ isSyncing: false, hasError: false, pendingCount: 3 });
    const sync = screen.getByTestId('sync');
    expect(sync.getAttribute('data-status')).toBe('pending');
    expect(sync.getAttribute('data-pending')).toBe('3');
  });

  it('does NOT show the pending indicator when the queue is empty', () => {
    renderHeader({ isSyncing: false, hasError: false, pendingCount: 0 });
    expect(screen.queryByTestId('sync')).toBeNull();
  });

  it('shows the syncing indicator (not the idle-pending one) while actively syncing', () => {
    renderHeader({ isSyncing: true, pendingCount: 2 });
    const sync = screen.getByTestId('sync');
    expect(sync.getAttribute('data-status')).toBe('syncing');
    expect(sync.getAttribute('data-pending')).toBe('2');
  });

  it('exposes the filter button and active-filters flag', () => {
    renderHeader({ hasActiveFilters: true });
    expect(screen.getByTestId('filter').getAttribute('data-has-active')).toBe('true');
  });

  it('renders sync indicator when isSyncing is true', () => {
    renderHeader({ isSyncing: true });
    expect(screen.getByTestId('sync').getAttribute('data-status')).toBe('syncing');
  });

  it('renders sync indicator with error status when hasError is true', () => {
    renderHeader({ hasError: true });
    expect(screen.getByTestId('sync').getAttribute('data-status')).toBe('error');
  });

  it('renders refresh indicator only when isRefreshing is true', () => {
    const { rerender } = renderHeader({ isRefreshing: false });
    expect(screen.queryByTestId('refresh')).toBeNull();

    rerender(
      <MemoryRouter>
        <EntryListHeader {...defaultProps} isRefreshing={true} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('refresh').getAttribute('data-refreshing')).toBe('true');
  });

  it('always renders the offline indicator slot', () => {
    renderHeader();
    expect(screen.getByTestId('offline')).not.toBeNull();
  });

  it('hides staff print actions when the actions menu disables print options', () => {
    renderHeader({
      actionsMenu: {
        ...defaultProps.actionsMenu,
        showPrintOptions: false,
        printOptions: [
          { label: 'Check-In Sheet', onClick: vi.fn(), icon: 'checkin' },
          { label: 'Results Sheet', onClick: vi.fn(), icon: 'results' },
          { label: 'Scoresheet', onClick: vi.fn(), icon: 'scoresheet' },
        ],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /actions menu/i }));

    expect(screen.getByText('Refresh')).not.toBeNull();
    expect(screen.queryByText('Check-In Sheet')).toBeNull();
    expect(screen.queryByText('Results Sheet')).toBeNull();
    expect(screen.queryByText('Scoresheet')).toBeNull();
  });

  it('keeps the actions menu trigger touch-safe at every viewport', () => {
    renderHeader();

    const trigger = screen.getByRole('button', { name: /actions menu/i });
    expect(trigger.className).toContain('min-h-11');
    expect(trigger.className).toContain('min-w-11');
    expect(trigger.className).toContain('sm:min-h-12');
    expect(trigger.className).toContain('focus-visible:ring-2');
  });

  it('puts the class title on its own row under the Up control on phones (MYK9-1500)', () => {
    renderHeader();

    const heading = screen.getByRole('heading');
    const row = heading.parentElement;
    const block = row?.parentElement;
    // Class names are pinned, not measured: jsdom has no layout. The browser measurement at 375px is the proof.
    expect(screen.getByRole('banner').className).toContain('max-sm:flex-wrap');
    expect(block?.className).toContain('max-sm:order-last');
    expect(block?.className).toContain('max-sm:basis-full');
    expect(row?.className).toContain('min-w-0');
    expect(row?.className).toContain('max-w-full');
    expect(heading.className).toContain('min-w-0');
    expect(heading.className).toContain('break-words');
  });

  it('keeps class details open after a click moves the pointer away', () => {
    renderHeader({ classInfo: { ...baseClassInfo, judgeName: 'J. Smith' } as ClassInfo });
    const trigger = screen.getByRole('button', { name: /Container Novice/i });

    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger);

    expect(screen.getByTestId('popover')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it.each(['Enter', ' '])('opens class details with the %s key', key => {
    renderHeader({ classInfo: { ...baseClassInfo, judgeName: 'J. Smith' } as ClassInfo });
    const trigger = screen.getByRole('button', { name: /Container Novice/i });

    fireEvent.keyDown(trigger, { key });

    expect(screen.getByTestId('popover')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('class-details-popover');
  });

  describe('ring phase label (MYK9-1526)', () => {
    const withLabel = (statusLabel: string | undefined): ClassInfo =>
      ({ ...baseClassInfo, statusLabel }) as unknown as ClassInfo;

    it.each([
      'Briefing 10:00 AM',
      'Break Until 10:30 AM',
      'Start Time 11:00 AM',
      'Offline Scoring',
    ])('shows %p in the header and hands it to the info popover', label => {
      renderHeader({ classInfo: withLabel(label) });
      expect(screen.getByText(label)).not.toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Container Novice/i }));
      expect(screen.getByTestId('popover').getAttribute('data-status-label')).toBe(label);
    });

    it('keeps the phase out of the truncating trial line', () => {
      renderHeader({ classInfo: withLabel('Briefing 10:00 AM') });
      const phase = screen.getByText('Briefing 10:00 AM');
      const trialLine = screen.getByText(/2026|May/);
      expect(phase).not.toBe(trialLine);
      expect(trialLine.textContent).not.toContain('Briefing');
    });

    it('shows no phase for plain In Progress', () => {
      renderHeader({ classInfo: withLabel(undefined) });
      expect(screen.queryByText(/Briefing|Break Until|Start Time|Offline Scoring/)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Container Novice/i }));
      const popover = screen.getByTestId('popover');
      expect(popover.getAttribute('data-status-label')).toBe('');
    });

    it('shows the phase on the combined A/B header too', () => {
      renderHeader({
        classInfo: {
          ...withLabel('Offline Scoring'),
          actualClassId: undefined,
          actualClassIdA: 'a',
          actualClassIdB: 'b',
          judgeNameB: 'J. Jones',
        } as ClassInfo,
        showSectionsBadge: true,
      });
      expect(screen.getByText('Offline Scoring')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Container Novice/i }));
      expect(screen.getByTestId('popover').getAttribute('data-status-label')).toBe(
        'Offline Scoring'
      );
    });
  });

  describe('popover timeLimitSeconds is always number | undefined', () => {
    // `judgeName` makes `hasExtraInfo` true so the info trigger renders and
    // the popover can be opened.
    const withTimeLimit = (timeLimit: string | undefined): ClassInfo =>
      ({ ...baseClassInfo, judgeName: 'J. Smith', timeLimit }) as unknown as ClassInfo;

    const openPopover = (classInfo: ClassInfo) => {
      renderHeader({ classInfo });
      fireEvent.click(screen.getByRole('button', { name: /Container Novice/i }));
      return screen.getByTestId('popover');
    };

    it('parses a clean "180s" string to the number 180', () => {
      const popover = openPopover(withTimeLimit('180s'));
      expect(popover.getAttribute('data-time-limit-type')).toBe('number');
      expect(popover.getAttribute('data-time-limit')).toBe('180');
    });

    it('passes undefined (not a string) when there is no limit', () => {
      const popover = openPopover(withTimeLimit(undefined));
      expect(popover.getAttribute('data-time-limit-type')).toBe('undefined');
    });

    // Regression: a non-numeric placeholder must NOT reach the slot as a
    // string or as NaN. `parseInt('TBD')` is NaN, and NaN is `typeof number`,
    // so an un-guarded path would slip it past the slot's type check.
    it.each(['TBD', 'TBDs', 'NaNs', ''])(
      'collapses the non-numeric value %p to undefined',
      junk => {
        const popover = openPopover(withTimeLimit(junk));
        expect(popover.getAttribute('data-time-limit-type')).toBe('undefined');
        expect(popover.getAttribute('data-time-limit')).not.toBe('NaN');
        expect(popover.getAttribute('data-time-limit')).not.toBe(junk);
      }
    );
  });
});
