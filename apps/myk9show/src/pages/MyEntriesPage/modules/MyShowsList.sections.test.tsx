/**
 * My Shows is one column at every width (MYK9-1447): today's show, upcoming shows soonest first
 * with their entries inline, then a collapsed Past shows section. `?show=` anchors to a show.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { groupEntriesByShow } from './groupEntriesByShow';
import { splitShowsIntoSections } from './myShowSections';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';

function showRow(id: string, name: string, dog: string, start: string, end: string) {
  return makeRow({
    id: `e-${id}`,
    registrationId: `r-${id}`,
    showId: `show-${id}`,
    showName: name,
    showDate: day(start),
    showEndDate: day(end),
    dogId: `dog-${dog}`,
    dogName: dog,
    classes: [
      makeClass({
        id: `c-${id}`,
        classId: `class-${id}`,
        name: `${name} Container`,
        trialDate: day(start),
      }),
    ],
  });
}

// Deliberately out of order: past first, the later upcoming show before the earlier one.
function shuffledRows() {
  return [
    showRow('past', 'Prairie Past Trial', 'Pepper', '2026-09-12', '2026-09-13'),
    showRow('later', 'Later Upcoming Trial', 'Nova', '2026-11-14', '2026-11-15'),
    ...heartlandRows(),
    showRow('early', 'Early Upcoming Trial', 'Biscuit', '2026-11-07', '2026-11-08'),
  ];
}

function renderList(route = '/exhibitor/entries', overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(shuffledRows()),
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
  return { props, ...render(<MyShowsList {...props} />, { initialRoute: route }) };
}

const SHOW_NAMES = [
  'Heartland Scent Work Classic',
  'Early Upcoming Trial',
  'Later Upcoming Trial',
  'Prairie Past Trial',
];

/** Document position of each element: lower comes first on the page. */
function isBefore(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('splitShowsIntoSections', () => {
  it('puts a running show in today, sorts upcoming soonest first and past most recent first', () => {
    const groups = groupEntriesByShow(
      toOrders([
        ...shuffledRows(),
        showRow('older', 'Older Past Trial', 'Rio', '2026-08-01', '2026-08-02'),
      ])
    );

    const sections = splitShowsIntoSections(groups, NOW);

    expect(sections.today.map(g => g.showName)).toEqual(['Heartland Scent Work Classic']);
    expect(sections.upcoming.map(g => g.showName)).toEqual([
      'Early Upcoming Trial',
      'Later Upcoming Trial',
    ]);
    expect(sections.past.map(g => g.showName)).toEqual(['Prairie Past Trial', 'Older Past Trial']);
  });
});

describe('MyShowsList sections', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(1280);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('orders today, upcoming soonest first, then Past shows', () => {
    renderList();

    const today = screen.getByRole('heading', { name: 'Today' });
    const upcoming = screen.getByRole('heading', { name: 'Upcoming shows' });
    const pastToggle = screen.getByRole('button', { name: /Past shows/ });
    const [heartland, early, later] = SHOW_NAMES.slice(0, 3).map(name =>
      screen.getByRole('heading', { name })
    );

    expect(isBefore(today, heartland!)).toBe(true);
    expect(isBefore(heartland!, upcoming)).toBe(true);
    expect(isBefore(upcoming, early!)).toBe(true);
    expect(isBefore(early!, later!)).toBe(true);
    expect(isBefore(later!, pastToggle)).toBe(true);
  });

  it('keeps Past shows collapsed until opened', async () => {
    const user = userEvent.setup();
    renderList();
    const toggle = screen.getByRole('button', { name: 'Past shows (1)' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Prairie Past Trial' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Prairie Past Trial' })).toBeInTheDocument();
  });

  it('lists each upcoming show with its entries inline, no click needed', () => {
    renderList();

    for (const [name, dog] of [
      ['Early Upcoming Trial', 'Biscuit'],
      ['Later Upcoming Trial', 'Nova'],
      ['Heartland Scent Work Classic', 'Juni'],
    ] as const) {
      const region = screen.getByRole('region', { name });
      expect(within(region).getByText(dog)).toBeInTheDocument();
      expect(
        within(region).getByRole('button', { name: `Actions for ${name}` })
      ).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Where to be today/ })).toHaveAttribute(
      'href',
      '/at-show/show-heartland'
    );
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
  });

  it('is the same column at 1024 and 390', () => {
    for (const width of [1024, 390]) {
      mockViewportWidth(width);
      const { unmount } = renderList();
      expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toContain(
        'Early Upcoming Trial'
      );
      unmount();
    }
  });

  it('shows the empty state when no show is listed', () => {
    renderList('/exhibitor/entries', { filteredEntries: [], emptyState: <p>nothing here</p> });

    expect(screen.getByText('nothing here')).toBeInTheDocument();
  });

  it('opens Past shows by default when there is nothing else to show', () => {
    renderList('/exhibitor/entries', {
      filteredEntries: toOrders([
        showRow('past', 'Prairie Past Trial', 'Pepper', '2026-09-12', '2026-09-13'),
      ]),
    });

    expect(screen.getByRole('heading', { name: 'Prairie Past Trial' })).toBeInTheDocument();
  });
});

describe('MyShowsList ?show= anchor', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(1280);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('scrolls to and marks the show it names, then lets the mark go', async () => {
    vi.useFakeTimers();
    renderList('/exhibitor/entries?show=show-later');

    const section = document.getElementById('my-show-show-later')!;
    expect(section).toHaveAttribute('data-highlighted', 'true');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances[0]).toBe(section);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(within(section).getByRole('heading', { name: 'Later Upcoming Trial' })).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(section).not.toHaveAttribute('data-highlighted');
    vi.useRealTimers();
  });

  it('jumps instantly when the viewer prefers reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    renderList('/exhibitor/entries?show=show-early');

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    });
  });

  it('opens Past shows for a past show it names', () => {
    renderList('/exhibitor/entries?show=show-past');

    const section = document.getElementById('my-show-show-past')!;
    expect(section).toHaveAttribute('data-highlighted', 'true');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a show that is not listed', () => {
    renderList('/exhibitor/entries?show=gone');

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });
});
