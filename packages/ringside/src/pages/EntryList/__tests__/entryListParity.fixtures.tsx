/**
 * Shared prop fixtures for the entry-list PARITY suite.
 *
 * `EntryListPage` renders BOTH the single-class list and the combined Novice
 * A/B pair. It did not always: the combined view was a second page, and every
 * difference the page-8b audit found between the two was a DIVERGENCE rather
 * than a design choice — the combined route had nothing the single-class page
 * lacked, and was behind on load gating, first-sync awareness, the mid-drag
 * sync guard, the containment banner, failure notification, and the dead tap on
 * a scored dog (MYK9-260).
 *
 * `entryListParity.test.tsx` runs ONE behaviour checklist against BOTH modes.
 * Most cases now pass by construction, which is exactly what the collapse
 * bought. The suite stays because `combined` still branches the page in six
 * places, and a branch is where the next divergence would start.
 */
import React from 'react';
import { vi } from 'vitest';
import type { EntryListPageProps } from '../pageProps';

/** Captured from the mocked EntryListContent so tests can drive its callbacks. */
export const contentSpy: {
  onEntryClick?: (entry: unknown) => void;
  onStatusClick?: (...args: unknown[]) => void;
} = {};

export function resetContentSpy(): void {
  delete contentSpy.onEntryClick;
  delete contentSpy.onStatusClick;
}

export const passthroughSlot = ({ children }: { children?: React.ReactNode }) => (
  <div>{children}</div>
);

/**
 * The PullToRefresh slot carries the MYK9-115 containment banner ("Score sync
 * paused"), so whether a page routes its content through it is a behaviour, not
 * a styling detail — the combined route rendered a plain div and gave a judge no
 * notice that the server had paused their uploads.
 */
export const pullToRefreshSlot = ({ children }: { children?: React.ReactNode }) => (
  <div data-testid="pull-to-refresh">{children}</div>
);

/**
 * Named slots carry testids the parity cases assert on; everything else falls
 * through the Proxy to a null component, for the same reason as dialogSlots.
 */
const NAMED_LAYOUT_SLOTS: Record<string, React.FC<{ children?: React.ReactNode }>> = {
  PullToRefresh: pullToRefreshSlot,
  ErrorState: () => <div data-testid="error-state" />,
};

export const layoutSlots = new Proxy(NAMED_LAYOUT_SLOTS, {
  get: (target, prop: string) => target[prop] ?? (() => null),
}) as Record<string, React.FC>;

/**
 * Every dialog slot the page can render. A Proxy rather than a literal: the
 * page mounts ten of these, and an omission surfaces as an opaque "Element type
 * is invalid" rather than a useful failure. Any slot it reaches for resolves to
 * a null component.
 */
export const dialogSlots = new Proxy({}, { get: () => () => null }) as Record<string, React.FC>;

export interface ParityCase {
  entries?: unknown[];
  /** Has the initial load COMPLETED — not "are there entries". */
  loaded?: boolean;
  fetchError?: Error | null;
}

export function makeSingleClassProps(cse: ParityCase = {}): EntryListPageProps {
  const { entries = [], loaded = true, fetchError = null } = cse;

  return {
    classId: 'class-a',
    data: { entries, classInfo: { className: 'Novice A' } },
    dataStatus: { isRefreshing: false, fetchError, refresh: vi.fn() },
    handlers: {
      handleEntryClick: vi.fn(),
      handleStatusClick: vi.fn(),
      handleResetMenuClick: vi.fn(),
      handleResetScore: vi.fn(),
      confirmResetScore: vi.fn(),
      cancelResetScore: vi.fn(),
      closeResetMenu: vi.fn(),
      resetConfirmDialog: { show: false, entry: null },
      resetMenuEntryId: null,
      resetMenuPosition: null,
    },
    actions: {},
    // Mirrors EntryListUiState exactly (pageProps.ts) rather than a guess —
    // the page reads `resetConfirmDialog`, `printDialogType`, `activeResetMenu`
    // and the area-count fields straight off this bag.
    uiState: {
      localEntries: entries,
      manualOrder: [],
      activeStatusPopup: null,
      isManualRefreshing: false,
      isLoaded: loaded,
      hasCompletedInitialLoad: loaded,
      isDragMode: false,
      runOrderDialogOpen: false,
      classOptionsDialogOpen: false,
      requirementsDialogOpen: false,
      maxTimeDialogOpen: false,
      maxTimeRequiredWarning: false,
      settingsDialogOpen: false,
      noStatsDialogOpen: false,
      statusDialogOpen: false,
      selfCheckinDisabledDialog: false,
      showSuccessMessage: false,
      areaCountDialogOpen: false,
      areaCountRequirements: null,
      isFilterPanelOpen: false,
      isRecalculatingPlacements: false,
      printDialogType: null,
      activeResetMenu: null,
      resetMenuPosition: null,
      resetConfirmDialog: { show: false, entry: null },
    },
    uiActions: new Proxy(
      {},
      {
        // Every setter is a no-op spy; enumerating all ~25 by hand would add
        // nothing but drift when the state bag changes.
        get: () => vi.fn(),
      }
    ),
    derived: {
      currentEntries: entries,
      completedEntries: [],
      pendingEntries: entries,
      entryCounts: { pending: 0, completed: 0, all: 0 },
      searchTerm: '',
      setSearchTerm: vi.fn(),
      activeTab: 'pending',
      setActiveTab: vi.fn(),
    },
    drag: { sensors: [], handleDragStart: vi.fn(), handleDragEnd: vi.fn() },
    dialogs: dialogSlots,
    layout: layoutSlots,
    context: { hasPermission: () => true, showId: 'show-1' },
  } as unknown as EntryListPageProps;
}

/**
 * Combined A/B is now the SAME page in a different mode (MYK9-260), so this
 * builder differs from the single-class one only by the `combined` bag and the
 * section-aware defaults. That it is a thin delta over `makeSingleClassProps`
 * is the collapse's whole point: there is no second implementation left for a
 * behaviour to be missing from.
 */
export function makeCombinedProps(cse: ParityCase = {}): EntryListPageProps {
  const base = makeSingleClassProps(cse);

  return {
    ...base,
    data: { ...base.data, classInfo: { className: 'Novice A/B' } },
    combined: {
      classIds: { a: 'class-a', b: 'class-b' },
      sectionFilter: 'all',
      setSectionFilter: vi.fn(),
    },
    derived: { ...base.derived, sortOrder: 'section-armband' },
  } as unknown as EntryListPageProps;
}
