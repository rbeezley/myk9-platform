import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { parseUserListParams } from '../userListParams';
import { easternDayStartIso } from '@/features/admin-overview/easternDay';
import { TodayCounts } from './TodayCounts';

const NOW = Date.parse('2026-09-05T19:00:00Z');
const COUNTS = {
  liveShows: 3,
  entriesToday: 41,
  signupsToday: 7,
  showsCreatedToday: 2,
};

function cell(label: string) {
  return screen.getByTestId(`today-count-${label}`);
}

describe('TodayCounts', () => {
  it('Signups links to /admin/users and the roster actually applies that filter', () => {
    render(<TodayCounts counts={COUNTS} clubsWaiting={4} now={NOW} />);
    const link = within(cell('Signups')).getByRole('link');
    expect(link).toHaveClass('min-h-11');

    const url = new URL(link.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/admin/users');
    const { filters } = parseUserListParams(url.searchParams);
    // The count excludes removed people (people_select RLS), so the destination must too.
    expect(filters.showDeleted).toBe(false);
    const start = filters.dateRange.start;
    expect(start?.toISOString()).toBe(easternDayStartIso(NOW));
  });

  it('Club requests waiting shows the count and opens the onboarding inbox', () => {
    render(<TodayCounts counts={COUNTS} clubsWaiting={4} now={NOW} />);
    expect(cell('Club requests waiting')).toHaveTextContent('4');
    expect(within(cell('Club requests waiting')).getByRole('link')).toHaveAttribute(
      'href',
      '/admin/onboarding'
    );
  });

  it.each(['Entries', 'Shows created', 'Live shows'])(
    '%s has no destination that applies its filter, so it renders static',
    label => {
      render(<TodayCounts counts={COUNTS} clubsWaiting={4} now={NOW} />);
      expect(within(cell(label)).queryByRole('link')).not.toBeInTheDocument();
    }
  );

  it('shows the numbers, with a dash while they load', () => {
    const { rerender } = render(<TodayCounts counts={COUNTS} clubsWaiting={4} now={NOW} />);
    expect(cell('Live shows')).toHaveTextContent('3');
    rerender(<TodayCounts counts={undefined} clubsWaiting={undefined} now={NOW} />);
    expect(cell('Signups')).toHaveTextContent('—');
  });
});
