import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ShowExhibitorView, type ShowExhibitorViewProps } from '../ShowExhibitorView';
import type { ShowDetailTabsProps } from '../ShowDetailTabs';
import type { Show } from '@/types/show-types';
import type { EntryStatusInfo } from '@/utils/entryStatusUtils';

// Lightweight passthrough mocks for shell primitives; this suite verifies the
// exhibitor view's OWN behavior (CTAs, entry-status badge, body branching).
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({ PageHeader: () => <div /> }));
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    badges,
    secondaryActions,
    closedMessage,
  }: {
    badges: { label: string }[];
    secondaryActions?: React.ReactNode;
    closedMessage?: string;
  }) => (
    <div data-testid="detail-hero">
      {badges.map(b => (
        <span key={b.label} data-testid="hero-badge">
          {b.label}
        </span>
      ))}
      {closedMessage && <div data-testid="closed-message">{closedMessage}</div>}
      <div data-testid="secondary-actions">{secondaryActions}</div>
    </div>
  ),
}));
vi.mock('@/components/shows/ShowDateBlock', () => ({ ShowDateBlock: () => null }));
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({ QuickInfoCards: () => null }));
vi.mock('@/components/shows/ArmbandLookup', () => ({
  ArmbandLookup: () => <div data-testid="armband-lookup" />,
}));
vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));
vi.mock('../ShowDetailTabs', () => ({
  ShowDetailTabs: () => <div data-testid="show-detail-tabs" />,
}));

function makeShow(): Show {
  return { id: 'show-1', name: 'Test Show' } as Show;
}

function makeEntryStatus(overrides: Partial<EntryStatusInfo> = {}): EntryStatusInfo {
  return {
    status: 'accepting',
    label: 'Accepting Entries',
    description: 'Entries are open',
    canEnter: true,
    ...overrides,
  };
}

function makeTabs(overrides: Partial<ShowDetailTabsProps> = {}): ShowDetailTabsProps {
  return {
    show: makeShow(),
    tabs: [],
    activeTab: 'overview',
    onTabChange: vi.fn(),
    canManageShow: false,
    canShowMap: false,
    isAuthenticated: true,
    hasUserEntries: false,
    judges: [],
    classes: [],
    trials: [],
    trialStats: {},
    mapTrials: [],
    mapClasses: [],
    mapEntries: [],
    ...overrides,
  };
}

function renderView(overrides: Partial<ShowExhibitorViewProps> = {}) {
  const props: ShowExhibitorViewProps = {
    show: makeShow(),
    breadcrumbs: [],
    catalogEntryCount: 0,
    entryStatus: makeEntryStatus(),
    hasUserEntries: false,
    onRegister: vi.fn(),
    isManagementSection: false,
    isWaitingForEntryDefault: false,
    tabs: makeTabs(),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={['/shows/show-1']}>
      <Routes>
        <Route path="/shows/:id" element={<ShowExhibitorView {...props} />}>
          <Route index element={<div data-testid="outlet-child">section</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return props;
}

describe('ShowExhibitorView', () => {
  it('shows the "See classes" deep-link when the show has classes', () => {
    const tabs = makeTabs({ classes: [{ id: 'c1' }] as ShowDetailTabsProps['classes'] });
    renderView({ tabs });
    fireEvent.click(screen.getByRole('button', { name: /see classes/i }));
    expect(tabs.onTabChange).toHaveBeenCalledWith('classes');
  });

  it('omits the "See classes" link when the show has no classes', () => {
    renderView({ tabs: makeTabs({ classes: [] }) });
    expect(screen.queryByRole('button', { name: /see classes/i })).toBeNull();
  });

  it('shows "Enter This Show" when entries are open and the user has none', () => {
    renderView({ entryStatus: makeEntryStatus({ canEnter: true }), hasUserEntries: false });
    expect(screen.getByRole('button', { name: 'Enter This Show' })).toBeInTheDocument();
  });

  it('shows "Manage Entry" when entries are open and the user already entered', () => {
    renderView({ entryStatus: makeEntryStatus({ canEnter: true }), hasUserEntries: true });
    expect(screen.getByRole('button', { name: 'Manage Entry' })).toBeInTheDocument();
  });

  it('shows "View Entry" when entries are closed but the user has entries', () => {
    renderView({
      entryStatus: makeEntryStatus({ canEnter: false, label: 'Closed' }),
      hasUserEntries: true,
    });
    expect(screen.getByRole('button', { name: 'View Entry' })).toBeInTheDocument();
  });

  it('shows no entry CTA when entries are closed and the user has none', () => {
    renderView({
      entryStatus: makeEntryStatus({ canEnter: false, label: 'Closed' }),
      hasUserEntries: false,
    });
    expect(screen.queryByRole('button', { name: /enter this show|manage entry|view entry/i })).toBeNull();
  });

  it('renders the entry-status badge', () => {
    renderView({ entryStatus: makeEntryStatus({ label: 'Closing Soon' }) });
    expect(screen.getByText('Closing Soon')).toBeInTheDocument();
  });

  it('does not render the staff armband lookup', () => {
    renderView();
    expect(screen.queryByTestId('armband-lookup')).toBeNull();
  });

  it('surfaces the closed message when entries cannot be entered', () => {
    renderView({
      entryStatus: makeEntryStatus({ canEnter: false, description: 'Entries closed on May 1' }),
    });
    expect(screen.getByTestId('closed-message')).toHaveTextContent('Entries closed on May 1');
  });

  it('renders the section Outlet (not the tabs) on a management-section URL', () => {
    renderView({ isManagementSection: true });
    expect(screen.getByTestId('outlet-child')).toBeInTheDocument();
    expect(screen.queryByTestId('show-detail-tabs')).toBeNull();
  });

  it('renders a loading skeleton (not the tabs) while the default tab is resolving', () => {
    renderView({ isWaitingForEntryDefault: true });
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('show-detail-tabs')).toBeNull();
  });

  it('renders the shared tabs in the normal case', () => {
    renderView();
    expect(screen.getByTestId('show-detail-tabs')).toBeInTheDocument();
  });
});
