/**
 * MYK9-1046: on a show's day My Shows offers one way into the at-show page,
 * which answers "where do I go next?" for every dog. Off show day nothing is
 * added. "Today" is the trial's calendar day in the trial's zone.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

function renderRows(rows: MyEntry[], now: Date = NOW) {
  return render(
    <MyShowsList
      filteredEntries={toOrders(rows, now)}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      now={now}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

const row = (trialDate: string, trialTimezone = 'America/Chicago') =>
  makeRow({
    id: 'e-juni',
    dogId: 'dog-juni',
    dogName: 'Juni',
    showId: 'show-heartland',
    showDate: day('2026-10-24'),
    showEndDate: day('2026-10-25'),
    classes: [makeClass({ trialDate: day(trialDate), trialTimezone })],
  });

describe('My Shows — "Where to be today" (MYK9-1046)', () => {
  it('links to the at-show page on a day one of the dogs runs', () => {
    renderRows([row('2026-10-24')]);
    const link = screen.getByRole('link', { name: /where to be today/i });
    expect(link).toHaveAttribute('href', '/at-show/show-heartland');
    expect(link.className).toContain('min-h-[44px]');
  });

  it('adds nothing on a different day of the same show', () => {
    renderRows([row('2026-10-25')]);
    expect(screen.queryByRole('link', { name: /where to be today/i })).not.toBeInTheDocument();
  });

  it("reckons the day in the trial's zone, not the browser's", () => {
    // 04:30Z on the 25th is still the evening of the 24th in Chicago.
    const lateChicago = new Date('2026-10-25T04:30:00Z');
    renderRows([row('2026-10-24')], lateChicago);
    expect(screen.getByRole('link', { name: /where to be today/i })).toBeInTheDocument();
  });

  it('ignores a class the exhibitor has left', () => {
    const left = row('2026-10-24');
    renderRows([{ ...left, classes: [makeClass({ status: 'withdrawn' })] }]);
    expect(screen.queryByRole('link', { name: /where to be today/i })).not.toBeInTheDocument();
  });

  // MYK9-1557: an undated class is "unknown", never silently "not today".
  it('says the day is unknown, and offers no link, while a class has no trial date yet', () => {
    const undated = row('2026-10-24');
    renderRows([{ ...undated, classes: [makeClass({ trialDate: undefined })] }]);
    expect(screen.queryByRole('link', { name: /where to be today/i })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting on a trial date/i)).toBeInTheDocument();
    expect(screen.getByText(/trial date not loaded yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't reach the server/i)).not.toBeInTheDocument();
  });

  it('swaps the unknown note for the link once the trial arrives', () => {
    const undated = row('2026-10-24');
    const { rerender } = renderRows([
      { ...undated, classes: [makeClass({ trialDate: undefined })] },
    ]);
    expect(screen.getByText(/waiting on a trial date/i)).toBeInTheDocument();
    rerender(
      <MyShowsList
        filteredEntries={toOrders([row('2026-10-24')], NOW)}
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
    expect(screen.queryByText(/waiting on a trial date/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /where to be today/i })).toBeInTheDocument();
  });
});
