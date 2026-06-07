import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { useShowPresenceRoster } from '@/features/show-presence/showPresenceContext';

const h = vi.hoisted(() => ({
  roster: [
    { userId: 'sec', name: 'Sue', role: 'secretary', location: { page: '/' }, activity: 'viewing', ts: 0 },
    { userId: 'ex1', name: 'Ann', role: 'exhibitor', location: { page: '/' }, activity: 'viewing', ts: 0 },
    { userId: 'ex2', name: 'Bob', role: 'exhibitor', location: { page: '/' }, activity: 'viewing', ts: 0 },
  ],
  viewer: { user: { id: 'sec' }, getUserRoles: () => ['secretary'] } as {
    user: { id: string };
    getUserRoles: () => string[];
  },
}));

vi.mock('@/features/show-presence/useShowPresence', () => ({
  useShowPresence: () => ({ present: h.roster }),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => h.viewer }));

function Probe() {
  const { present } = useShowPresenceRoster();
  return (
    <div data-testid="names">
      {present
        .map(p => p.name)
        .sort()
        .join(',')}
    </div>
  );
}

describe('ShowPresenceProvider', () => {
  it('exposes the full roster to a staff viewer', () => {
    h.viewer = { user: { id: 'sec' }, getUserRoles: () => ['secretary'] };
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('Ann,Bob,Sue');
  });

  it('hides other exhibitors from an exhibitor viewer (sees staff + self)', () => {
    h.viewer = { user: { id: 'ex1' }, getUserRoles: () => ['exhibitor'] };
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('Ann,Sue');
  });

  it('returns an empty roster outside any provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('names').textContent).toBe('');
  });
});
