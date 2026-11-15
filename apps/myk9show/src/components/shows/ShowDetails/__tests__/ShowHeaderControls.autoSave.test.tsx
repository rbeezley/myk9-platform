/**
 * MYK9-1994: the header saves the offline copy by itself only for a signed-in person, on KNOWN dates
 * and timezone, inside the show-day window. The window helper fails open while trials load, so
 * "trials not loaded" must never start a forced full sync.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import { ShowHeaderControls } from '../ShowHeaderControls';

const state = vi.hoisted(() => ({
  trials: undefined as unknown[] | undefined,
  user: { id: 'u1', last_sign_in_at: '2026-11-14T10:00:00Z', is_anonymous: false } as {
    id: string;
    last_sign_in_at: string;
    is_anonymous: boolean;
  } | null,
  inWindow: true,
  timeZone: 'America/New_York',
  badge: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: state.user }) }));
vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: () => ({ data: state.trials }),
}));
vi.mock('@/features/registries', () => ({ getTrialTimezone: () => state.timeZone }));
vi.mock('@/features/offline-readiness/offlinePromptWindow', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline-readiness/offlinePromptWindow')>()),
  isInOfflinePromptWindow: () => state.inWindow,
}));
vi.mock('@/components/shows/ShowDetails/ShowSyncStatus', () => ({
  useSyncNote: () => ({ label: 'All changes saved', needsAttention: false }),
}));
vi.mock('@/features/show-presence/ShowPresenceStack', () => ({ ShowPresenceStack: () => null }));
vi.mock('@/features/show-live-sync/LiveUpdateIndicator', () => ({
  LiveUpdateIndicator: () => null,
}));
vi.mock('@/features/offline-readiness/OfflineReadyBadge', () => ({
  OfflineReadyBadge: (props: unknown) => {
    state.badge(props);
    return null;
  },
}));

const show = { id: 'show-1', startDate: '2026-11-14', endDate: '2026-11-15' } as Show;

function lastKey(): string | undefined {
  return (state.badge.mock.calls.at(-1)?.[0] as { autoSaveKey?: string }).autoSaveKey;
}

describe('ShowHeaderControls auto-save key', () => {
  beforeEach(() => {
    state.badge.mockClear();
    state.trials = [{ id: 't1' }];
    state.inWindow = true;
    state.timeZone = 'America/New_York';
    state.user = { id: 'u1', last_sign_in_at: '2026-11-14T10:00:00Z', is_anonymous: false };
  });

  it('names the user, this sign-in and the show inside the window with known dates', () => {
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBe('u1:2026-11-14T10:00:00Z:show-1');
  });

  it('does not auto-save while trials have not loaded, even though the window fails open', () => {
    state.trials = undefined;
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBeUndefined();
  });

  it('does not auto-save when the start date is unreadable', () => {
    render(<ShowHeaderControls show={{ ...show, startDate: '' } as Show} />);
    expect(lastKey()).toBeUndefined();
  });

  it.each(['2026-13-45', 'next week', '2026-02-30'])(
    'does not auto-save on a malformed start date (%s)',
    startDate => {
      render(<ShowHeaderControls show={{ ...show, startDate } as Show} />);
      expect(lastKey()).toBeUndefined();
    }
  );

  it.each(['', 'Not/AZone'])('does not auto-save on a missing or invalid timezone (%j)', zone => {
    state.timeZone = zone;
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBeUndefined();
  });

  it('does not auto-save outside the window', () => {
    state.inWindow = false;
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBeUndefined();
  });

  it('does not auto-save for a signed-out or passcode session', () => {
    state.user = null;
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBeUndefined();
    state.user = { id: 'anon', last_sign_in_at: 'x', is_anonymous: true };
    render(<ShowHeaderControls show={show} />);
    expect(lastKey()).toBeUndefined();
  });
});
