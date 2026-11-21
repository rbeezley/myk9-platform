/**
 * What a My Shows card answers before the exhibitor has to email the secretary
 * (MYK9-2027): judge and time on the class row, a labelled armband, the street
 * address with directions, and the countdown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { fetchShowsJudgeNameParts } from '@/services/database/_shared/judgeNamesByClass';
import { MyShowsList } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

vi.mock('@/features/payments/useMyPayments', () => ({ useMyPayments: () => ({ data: [] }) }));
vi.mock('@/services/database/_shared/judgeNamesByClass', () => ({
  fetchShowsJudgeNameParts: vi.fn(),
}));

const STREET = '100 Dog Show Lane, Tulsa, OK 74101';

function renderRows(rows: MyEntry[]) {
  return render(
    <MyShowsList
      filteredEntries={toOrders(rows)}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      now={NOW}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

function showRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return makeRow({
    showId: 'show-1',
    showName: 'Heartland Scent Work Classic',
    showDate: day('2026-10-29'),
    showEndDate: day('2026-10-30'),
    location: { venue: 'Expo Hall', city: 'Tulsa', state: 'OK', street: STREET },
    armband: '42',
    classes: [
      makeClass({
        id: 'e-a',
        classId: 'class-a',
        name: 'Novice Interior',
        trialDate: day('2026-10-29'),
        startTime: '9:00 AM',
      }),
      makeClass({
        id: 'e-b',
        classId: 'class-b',
        name: 'Novice Exterior',
        trialDate: day('2026-10-29'),
        startTime: undefined,
      }),
    ],
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(fetchShowsJudgeNameParts).mockResolvedValue(
    new Map([
      [
        'show-1',
        new Map([
          ['class-a', { personId: 'p1', firstName: 'Dana', lastName: 'Whitlock' }],
          ['class-b', { personId: 'p2', firstName: 'Lee', lastName: 'Okafor' }],
        ]),
      ],
    ])
  );
});

describe('My Shows card facts', () => {
  it('shows the judge on each class and a time only where one is set', async () => {
    renderRows([showRow()]);

    const judgePart = await screen.findByText('Judge Dana Whitlock');
    expect(judgePart).toBeInTheDocument();
    expect(judgePart.parentElement).toHaveTextContent('Judge Dana Whitlock9:00 AM');
    expect(within(judgePart.parentElement as HTMLElement).getByText('9:00 AM')).toBeInTheDocument();
    expect(judgePart.parentElement).not.toHaveTextContent('·');
    expect(screen.getByText('Judge Lee Okafor')).toBeInTheDocument();
    expect(fetchShowsJudgeNameParts).toHaveBeenCalledWith(['show-1']);
  });

  it('puts no separator glyph in the show header lines (MYK9-2325)', async () => {
    const { container } = renderRows([showRow()]);
    await screen.findByText('Heartland Scent Work Classic');
    const metas = container.querySelectorAll('.myk9-entries-show-meta');
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) expect(meta.textContent).not.toContain('·');
  });

  it('renders no judge text for a class whose judge is unknown', async () => {
    vi.mocked(fetchShowsJudgeNameParts).mockResolvedValue(new Map([['show-1', new Map()]]));
    renderRows([showRow()]);

    expect(await screen.findByText('Novice Interior')).toBeInTheDocument();
    expect(screen.queryByText(/Judge/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TBD/)).not.toBeInTheDocument();
  });

  it('labels the armband, and says when there is none yet', () => {
    renderRows([showRow()]);
    expect(screen.getByText('Armband 42')).toBeInTheDocument();
  });

  it('says the armband is not assigned yet', () => {
    renderRows([showRow({ armband: undefined })]);
    expect(screen.getByText('Armband not assigned yet')).toBeInTheDocument();
  });

  it('shows the street address and builds directions from it, not the city', () => {
    renderRows([showRow()]);
    const region = screen.getByRole('region', { name: 'Heartland Scent Work Classic' });
    expect(within(region).getByText(STREET)).toBeInTheDocument();
    const link = within(region).getByRole('link', { name: `Get directions to ${STREET}` });
    expect(link).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(STREET)}`
    );
  });

  it('falls back to the venue, city and state when no street address is stored', () => {
    renderRows([showRow({ location: { venue: 'Expo Hall', city: 'Tulsa', state: 'OK' } })]);
    const link = screen.getByRole('link', { name: 'Get directions to Expo Hall, Tulsa, OK' });
    expect(link).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Expo Hall, Tulsa, OK')}`
    );
  });

  it('shows the countdown in the show header', () => {
    renderRows([showRow()]);
    expect(screen.getByText('In 5 days')).toBeInTheDocument();
  });
});

describe('a dog in an unpublished show', () => {
  it('does not read "trial date not loaded yet" on its class row or the card strip', () => {
    renderRows([
      makeRow({
        showId: 'show-draft',
        showName: 'Unpublished show',
        isShowUnreadable: true,
        showDate: undefined,
        showEndDate: undefined,
        classes: [makeClass({ id: 'e-x', classId: undefined, trialDate: undefined })],
      }),
    ]);
    expect(screen.queryByText(/trial date not loaded yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still waiting on a trial date/)).not.toBeInTheDocument();
  });

  it('keeps the wording for a readable show whose trial has not replicated', () => {
    renderRows([
      showRow({
        classes: [makeClass({ id: 'e-y', classId: 'class-a', trialDate: undefined })],
      }),
    ]);
    expect(screen.getByText(/trial date not loaded yet/)).toBeInTheDocument();
  });
});
