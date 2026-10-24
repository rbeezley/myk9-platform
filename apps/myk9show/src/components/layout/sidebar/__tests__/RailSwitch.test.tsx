import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CalendarCheck } from 'lucide-react';
import { render, screen } from '@/test/utils/testUtils';
import { RailSwitch } from '../RailSwitch';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

const SAME_NAME = 'Heartland Scent Work Week';
const shows = [
  { id: 's1', name: SAME_NAME, startDate: '2026-10-22', endDate: '2026-10-28' },
  { id: 's2', name: SAME_NAME, startDate: '2026-11-05', endDate: '2026-11-08' },
];

describe('RailSwitch same-named shows', () => {
  it('carries the date range into the switch items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, null, {
      currentShow: shows[0],
      managingShows: shows,
      onChooseShow: () => undefined,
    });
    const group = config.groups.find(g => g.title === 'Current show');
    expect(group?.items[1].subtitle).toBe('Nov 5–8, 2026');
  });

  it('renders rows that differ by date range', async () => {
    const user = userEvent.setup();
    const items = shows.map(s => ({
      title: s.name,
      href: `/shows/${s.id}`,
      icon: CalendarCheck,
      subtitle: s.id === 's1' ? 'Oct 22–28, 2026' : 'Nov 5–8, 2026',
    }));
    render(<RailSwitch items={items} isActive={() => false} />);
    await user.click(screen.getByRole('button', { name: 'Switch show' }));

    const first = await screen.findByRole('link', { name: `${SAME_NAME}, Oct 22–28, 2026` });
    const second = screen.getByRole('link', { name: `${SAME_NAME}, Nov 5–8, 2026` });
    expect(first).toHaveAttribute('href', '/shows/s1');
    expect(second).toHaveAttribute('href', '/shows/s2');
    expect(first.textContent).not.toBe(second.textContent);
  });
});
