/**
 * Smoke tests for `EntryListHeader` (PR E2d-2b).
 *
 * Scope: layout slot pass-through, popover-on-click when classInfo
 * has extra info. The internal primitives (HamburgerMenu, sync
 * indicators, etc.) are stubbed — the test verifies the page wires
 * the slots correctly, not the primitives themselves. Uses vanilla
 * vitest assertions.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { ClassInfo } from '../hooks/useEntryListData';
import type {
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ClassDetailsPopoverProps,
} from '../pageProps';
import { EntryListHeader } from './EntryListHeader';

const StubHamburgerMenu: ComponentType<HamburgerMenuProps> = ({ currentPage }) => (
  <button data-testid="hamburger" data-current-page={currentPage}>
    menu
  </button>
);
const StubOffline: ComponentType<CompactOfflineIndicatorProps> = () => (
  <span data-testid="offline" />
);
const StubSync: ComponentType<SyncIndicatorProps> = ({ status }) => (
  <span data-testid="sync" data-status={status} />
);
const StubRefresh: ComponentType<RefreshIndicatorProps> = ({ isRefreshing }) => (
  <span data-testid="refresh" data-refreshing={String(isRefreshing)} />
);
const StubFilter: ComponentType<FilterTriggerButtonProps> = ({ onClick, hasActiveFilters }) => (
  <button
    data-testid="filter"
    data-has-active={String(hasActiveFilters)}
    onClick={onClick}
  />
);
const StubPopover: ComponentType<ClassDetailsPopoverProps> = ({ isOpen, data }) =>
  isOpen ? (
    <div
      data-testid="popover"
      data-class-id={String(data.classId)}
      data-time-limit={String(data.timeLimitSeconds)}
      data-time-limit-type={typeof data.timeLimitSeconds}
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

const defaultProps = {
  classInfo: baseClassInfo,
  isRefreshing: false,
  isSyncing: false,
  hasError: false,
  hasActiveFilters: false,
  onFilterClick: vi.fn(),
  onRefresh: vi.fn(),
  actionsMenu: {
    showRunOrder: false,
    showRecalculatePlacements: false,
    showClassSettings: false,
    onRunOrderClick: vi.fn(),
    onRecalculatePlacements: vi.fn() as () => Promise<void>,
    onClassSettingsClick: vi.fn(),
    printOptions: [],
  },
  HamburgerMenu: StubHamburgerMenu,
  CompactOfflineIndicator: StubOffline,
  SyncIndicator: StubSync,
  RefreshIndicator: StubRefresh,
  FilterTriggerButton: StubFilter,
  ClassDetailsPopover: StubPopover,
};

const renderHeader = (override: Partial<typeof defaultProps> = {}) =>
  render(
    <MemoryRouter>
      <EntryListHeader {...defaultProps} {...override} />
    </MemoryRouter>
  );

describe('EntryListHeader', () => {
  it('renders the hamburger menu slot with currentPage="entries"', () => {
    renderHeader();
    const hb = screen.getByTestId('hamburger');
    expect(hb.getAttribute('data-current-page')).toBe('entries');
  });

  it('renders the class name in title case', () => {
    renderHeader();
    const heading = screen.getByRole('heading');
    expect(heading.textContent).toMatch(/Container Novice A/);
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
      (junk) => {
        const popover = openPopover(withTimeLimit(junk));
        expect(popover.getAttribute('data-time-limit-type')).toBe('undefined');
        expect(popover.getAttribute('data-time-limit')).not.toBe('NaN');
        expect(popover.getAttribute('data-time-limit')).not.toBe(junk);
      }
    );
  });
});
