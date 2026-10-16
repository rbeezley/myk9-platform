/**
 * My Shows as list and detail from `lg` (docs/plan-sidebar-browse-pane.md, phase 4).
 *
 * The detail pane is `MyShowsList` narrowed to one show, so these tests pin the layout contract
 * (which show is open, how the URL follows it, what the narrow layout keeps) and that the actions
 * the page carries over still render inside the pane.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import {
  day,
  heartlandRows,
  makeClass,
  makeRow,
  NOW,
  toOrders,
} from '@/test/fixtures/myShowsFixtures';
import type { MyShowGroup } from './groupEntriesByShow';
import { groupEntriesByShow } from './groupEntriesByShow';
import {
  MyShowsSplit,
  type MyShowsSplitProps,
  pickSelectedShowKey,
  splitShowsByWhen,
  SELECTED_SHOW_PARAM,
} from './MyShowsSplit';

const PAST_SHOW = {
  id: 'e-past',
  registrationId: 'r-past',
  showId: 'show-past',
  showName: 'Prairie Nose Work Trial',
  showDate: day('2026-09-12'),
  showEndDate: day('2026-09-13'),
  dogName: 'Pepper',
  dogId: 'dog-pepper',
  classes: [makeClass({ id: 'c-past', name: 'Container Novice', trialDate: day('2026-09-12') })],
};

function allOrders() {
  return toOrders([...heartlandRows(), makeRow(PAST_SHOW)]);
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderSplit(route = '/exhibitor/entries', overrides: Partial<MyShowsSplitProps> = {}) {
  const props: MyShowsSplitProps = {
    filteredEntries: allOrders(),
    source: 'confirmed',
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    onLeaveClass: vi.fn(),
    ...overrides,
  };
  return render(
    <>
      <Routes>
        <Route path="/exhibitor/entries" element={<MyShowsSplit {...props} />} />
      </Routes>
      <LocationProbe />
    </>,
    { initialRoute: route }
  );
}

const location = () => screen.getByTestId('location').textContent;
const listPane = () => screen.getByRole('region', { name: 'Your shows' });
const detailPane = () => screen.getByRole('region', { name: 'Entries for the selected show' });

describe('splitShowsByWhen / pickSelectedShowKey', () => {
  const groups: MyShowGroup[] = groupEntriesByShow(allOrders());

  it('puts a show running today in Upcoming and a finished one in Past', () => {
    const { upcoming, past } = splitShowsByWhen(groups, NOW);

    expect(upcoming.map(g => g.showName)).toEqual(['Heartland Scent Work Classic']);
    expect(past.map(g => g.showName)).toEqual(['Prairie Nose Work Trial']);
  });

  it('opens the requested show, else the first Upcoming, else the first Past', () => {
    const shows = splitShowsByWhen(groups, NOW);

    expect(pickSelectedShowKey(shows, 'show-past')).toBe('show-past');
    expect(pickSelectedShowKey(shows, 'no-such-show')).toBe('show-heartland');
    expect(pickSelectedShowKey(shows, null)).toBe('show-heartland');
    expect(pickSelectedShowKey({ upcoming: [], past: shows.past }, null)).toBe('show-past');
    expect(pickSelectedShowKey({ upcoming: [], past: [] }, null)).toBeUndefined();
  });
});

describe('MyShowsSplit at lg', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(1440);
  });

  it('lists the exhibitor’s shows under Upcoming and Past', () => {
    renderSplit();
    const list = within(listPane());

    expect(list.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(list.getByRole('heading', { name: 'Past' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: /Heartland Scent Work Classic/ })).toBeInTheDocument();
    expect(list.getByRole('link', { name: /Prairie Nose Work Trial/ })).toBeInTheDocument();
    expect(list.queryByRole('link', { name: 'Find a show' })).not.toBeInTheDocument();
  });

  it('draws the filters above the list inside the list pane, once', () => {
    renderSplit('/exhibitor/entries', { filters: <p>the filter strip</p> });

    const filters = within(listPane()).getByText('the filter strip');
    const firstHeading = within(listPane()).getByRole('heading', { name: 'Upcoming' });
    expect(
      filters.compareDocumentPosition(firstHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getAllByText('the filter strip')).toHaveLength(1);
    expect(within(detailPane()).queryByText('the filter strip')).not.toBeInTheDocument();
  });

  it('opens the first upcoming show by default and only that show', () => {
    renderSplit();

    expect(
      within(listPane()).getByRole('link', { name: /Heartland Scent Work Classic/ })
    ).toHaveAttribute('aria-current', 'page');
    const detail = within(detailPane());
    expect(
      detail.getByRole('heading', { name: 'Heartland Scent Work Classic' })
    ).toBeInTheDocument();
    expect(detail.queryByText('Prairie Nose Work Trial')).not.toBeInTheDocument();
  });

  it('carries the show’s actions into the detail pane', () => {
    renderSplit();

    expect(
      within(detailPane()).getByRole('button', { name: 'Actions for Heartland Scent Work Classic' })
    ).toBeInTheDocument();
  });

  it('opens the show named by ?show= and keeps the other parameters on every row', () => {
    renderSplit(`/exhibitor/entries?${SELECTED_SHOW_PARAM}=show-past&status=accepted`);

    expect(
      within(detailPane()).getByRole('heading', { name: 'Prairie Nose Work Trial' })
    ).toBeInTheDocument();
    expect(
      within(detailPane()).queryByText('Heartland Scent Work Classic')
    ).not.toBeInTheDocument();
    const heartland = within(listPane()).getByRole('link', {
      name: /Heartland Scent Work Classic/,
    });
    expect(heartland).toHaveAttribute(
      'href',
      '/exhibitor/entries?show=show-heartland&status=accepted'
    );
  });

  it('falls back to the first upcoming show when ?show= names one that is not listed', () => {
    renderSplit(`/exhibitor/entries?${SELECTED_SHOW_PARAM}=gone`);

    expect(
      within(detailPane()).getByRole('heading', { name: 'Heartland Scent Work Classic' })
    ).toBeInTheDocument();
  });

  it('keeps the split, with the filters and the empty-state card, when nothing matches', () => {
    renderSplit('/exhibitor/entries', {
      filteredEntries: [],
      filters: <p>the filter strip</p>,
      emptyState: <p>nothing here</p>,
    });

    expect(within(listPane()).getByText('the filter strip')).toBeInTheDocument();
    expect(within(listPane()).getByText('nothing here')).toBeInTheDocument();
    expect(within(detailPane()).getByText('No shows match these filters.')).toBeInTheDocument();
  });

  it('opens the newly selected show at the top of the detail pane, leaving the list scroll alone', async () => {
    const user = userEvent.setup();
    renderSplit();
    const listScroller = listPane().querySelector<HTMLElement>('.overflow-y-auto');
    if (!listScroller) throw new Error('no list scroll container');
    detailPane().scrollTop = 300;
    listScroller.scrollTop = 120;

    await user.click(within(listPane()).getByRole('link', { name: /Prairie Nose Work Trial/ }));

    expect(detailPane().scrollTop).toBe(0);
    expect(listScroller.scrollTop).toBe(120);
  });

  it('selecting a show puts it in the URL and swaps the detail', async () => {
    const user = userEvent.setup();
    renderSplit();

    await user.click(within(listPane()).getByRole('link', { name: /Prairie Nose Work Trial/ }));

    expect(location()).toBe('/exhibitor/entries?show=show-past');
    expect(
      within(detailPane()).getByRole('heading', { name: 'Prairie Nose Work Trial' })
    ).toBeInTheDocument();
  });
});

describe('MyShowsSplit below lg', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(800);
  });

  it('is today’s single column: every show, no list pane', () => {
    renderSplit();

    expect(screen.queryByRole('region', { name: 'Your shows' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Find a show' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Heartland Scent Work Classic' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prairie Nose Work Trial' })).toBeInTheDocument();
  });
});
