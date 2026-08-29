/**
 * The combined Section A/B route is a SECOND implementation of the entry list,
 * and it was behind the single-class page on every load-state axis. These pin
 * the two that were user-visible.
 *
 * The gate used to be `!entries.length && !fetchError`, which conflates "no data
 * yet" with "no data at all": a combined Novice A/B class that genuinely has no
 * entries shimmered forever with no empty state, and a partially-arrived list
 * read as complete the moment one entry landed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CombinedEntryListPage } from '../CombinedEntryListPage';
import type { CombinedEntryListPageProps } from '../pageProps';

vi.mock('../components/EntryListContent', () => ({
  EntryListContent: () => <div data-testid="entry-list-content" />,
}));

const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const pullToRefreshSpy = ({ children }: { children?: React.ReactNode }) => (
  <div data-testid="pull-to-refresh">{children}</div>
);

function makeProps(
  overrides: {
    entries?: unknown[];
    isLoaded?: boolean;
    fetchError?: Error | null;
  } = {}
): CombinedEntryListPageProps {
  const { entries = [], isLoaded = true, fetchError = null } = overrides;

  return {
    classIds: { a: 'class-a', b: 'class-b' },
    data: { entries, classInfo: { className: 'Novice A/B' } },
    dataStatus: { isRefreshing: false, fetchError, refresh: vi.fn() },
    actions: {},
    combinedHandlers: {
      resetConfirmDialog: { show: false, entry: null },
      resetMenuEntryId: null,
      resetMenuPosition: null,
      handleStatusClick: vi.fn(),
      handleResetMenuClick: vi.fn(),
      handleResetScore: vi.fn(),
      confirmResetScore: vi.fn(),
      cancelResetScore: vi.fn(),
      closeResetMenu: vi.fn(),
    },
    uiState: {
      localEntries: entries,
      sortOrder: 'section-armband',
      isLoaded,
      isFilterPanelOpen: false,
      runOrderDialogOpen: false,
      showSuccessMessage: false,
      isDragMode: false,
      selfCheckinDisabledDialog: false,
      printDialogState: {},
    },
    uiActions: {
      setLocalEntries: vi.fn(),
      setSortOrder: vi.fn(),
      setIsLoaded: vi.fn(),
      setIsFilterPanelOpen: vi.fn(),
      setRunOrderDialogOpen: vi.fn(),
      setShowSuccessMessage: vi.fn(),
      setIsDragMode: vi.fn(),
      setSelfCheckinDisabledDialog: vi.fn(),
      setPrintDialogState: vi.fn(),
    },
    derived: {
      currentEntries: entries,
      completedEntries: [],
      pendingEntries: entries,
      entryCounts: { pending: 0, completed: 0, all: 0 },
      searchTerm: '',
      setSearchTerm: vi.fn(),
      activeTab: 'pending',
      setActiveTab: vi.fn(),
      sectionFilter: 'all',
      setSectionFilter: vi.fn(),
    },
    drag: { sensors: [], handleDragStart: vi.fn(), handleDragEnd: vi.fn() },
    dialogs: {
      CheckinStatusDialog: () => null,
      RunOrderDialog: () => null,
      ScoresheetPrintDialog: () => null,
    },
    layout: {
      PullToRefresh: pullToRefreshSpy,
      HamburgerMenu: () => null,
      CompactOfflineIndicator: () => null,
      SyncIndicator: () => null,
      RefreshIndicator: () => null,
      FilterTriggerButton: () => null,
      FilterPanel: () => null,
      TabBar: () => null,
      ErrorState: () => null,
      SuccessToast: () => null,
      BackButton: () => null,
    },
    context: { hasPermission: () => true, showId: 'show-1' },
    dispatchPrintAction: vi.fn(),
  } as unknown as CombinedEntryListPageProps;
}

function renderPage(props: CombinedEntryListPageProps) {
  return render(
    <MemoryRouter>
      <CombinedEntryListPage {...props} />
    </MemoryRouter>
  );
}

// The non-empty render is covered by the page's own suite; reproducing its full
// derived-data fixture here would mostly exercise the fixture. These two pin the
// gate itself, which is what changed.
describe('CombinedEntryListPage — load states', () => {
  it('shows an empty state, not an endless skeleton, for a class with no entries', () => {
    renderPage(makeProps({ entries: [], isLoaded: true }));

    expect(screen.getByText(/no entries yet/i)).not.toBeNull();
    expect(screen.queryByTestId('entry-list-content')).toBeNull();
  });

  it('routes its content through the PullToRefresh slot, which carries the containment banner', () => {
    // Rendering a plain div here meant a judge on a COMBINED class got no notice
    // that the server had paused their score uploads (MYK9-115) -- the single-
    // class page has always wrapped its content in this slot.
    renderPage(makeProps({ entries: [{ id: 'e1', classId: 'class-a' }], isLoaded: true }));

    expect(screen.getByTestId('pull-to-refresh')).not.toBeNull();
  });

  it('still shows the skeleton while the load has not completed', () => {
    renderPage(makeProps({ entries: [], isLoaded: false }));

    expect(screen.queryByText(/no entries yet/i)).toBeNull();
  });

});
