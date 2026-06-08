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
  // The local user's resolved presence identity (account OR anon passcode grant).
  viewer: { userId: 'sec', name: 'Sue', role: 'secretary' } as {
    userId: string;
    name: string;
    role: string;
  } | null,
}));

vi.mock('@/features/show-presence/useShowPresence', () => ({
  useShowPresence: () => ({ present: h.roster, setEditing: vi.fn(), clearEditing: vi.fn() }),
}));

vi.mock('@/features/show-presence/useLocalPresenceIdentity', () => ({
  useLocalPresenceIdentity: () => h.viewer,
}));

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
    h.viewer = { userId: 'sec', name: 'Sue', role: 'secretary' };
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('Ann,Bob,Sue');
  });

  it('hides other exhibitors from an exhibitor viewer (sees staff + self)', () => {
    h.viewer = { userId: 'ex1', name: 'Ann', role: 'exhibitor' };
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('Ann,Sue');
  });

  it('gives an anonymous passcode judge the full staff-inclusive roster', () => {
    // Anon judge (no account) resolves a 'judge' identity from the grant, so the
    // viewer side treats them as staff — they see everyone, not the narrowed set.
    h.viewer = { userId: 'anon-1', name: 'Judge Sarah', role: 'judge' };
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    expect(screen.getByTestId('names').textContent).toBe('Ann,Bob,Sue');
  });

  it('treats a viewer with no identity as a least-privilege exhibitor', () => {
    h.viewer = null;
    render(
      <ShowPresenceProvider showId="s1">
        <Probe />
      </ShowPresenceProvider>
    );
    // No identity → exhibitor default → sees staff only (no self to add).
    expect(screen.getByTestId('names').textContent).toBe('Sue');
  });

  it('returns an empty roster outside any provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('names').textContent).toBe('');
  });
});
