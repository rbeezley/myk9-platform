import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { setupOptimizedPresence } from '@/utils/realtimeOptimization';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';

/**
 * Regression for the mount race Codex flagged on PR #593: a panel already OPEN on
 * first mount calls useEditingPresence (a descendant effect) BEFORE the provider's
 * useShowPresence identity effect populates infoRef — because React runs child
 * effects before parent effects. Without the pendingEditRef stash, the editing
 * advisory is silently dropped and never broadcast. This test asserts the editing
 * slot survives that ordering and reaches channel.track().
 */

vi.mock('@/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));
vi.mock('@/utils/realtimeOptimization', () => ({
  setupOptimizedPresence: vi.fn(() => vi.fn()),
}));
vi.mock('@/config/features', () => ({ features: { showPresence: true } }));
vi.mock('@/features/show-presence/editAwarenessFlag', () => ({
  showEditAwarenessEnabled: () => true,
}));
// The local user resolves to a real identity so the provider is a producer.
vi.mock('@/features/show-presence/useLocalPresenceIdentity', () => ({
  useLocalPresenceIdentity: () => ({ userId: 'u1', name: 'Mariana', role: 'secretary' }),
}));
// Phase 2 sibling hook is irrelevant here; keep it inert.
vi.mock('@/features/show-live-sync/useShowLiveSync', () => ({
  useShowLiveSync: () => {},
  showLiveSyncEnabled: () => false,
}));

interface FakeChannel {
  topic: string;
  state: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
}

let lastChannel: FakeChannel;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.channel).mockImplementation((name: string) => {
    lastChannel = {
      topic: `realtime:${name}`,
      state: 'joined',
      on: vi.fn(),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED');
        return lastChannel;
      }),
      track: vi.fn(),
      untrack: vi.fn(),
      presenceState: vi.fn(() => ({})),
    };
    return lastChannel as unknown as ReturnType<typeof supabase.channel>;
  });
  vi.mocked(setupOptimizedPresence).mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
});

/** A panel that is "open" from the very first render. */
function OpenOnMountPanel() {
  useEditingPresence('show', 's1');
  return null;
}

const tree = (children: ReactNode) => (
  <MemoryRouter initialEntries={['/shows/s1/edit']}>
    <ShowPresenceProvider showId="s1">{children}</ShowPresenceProvider>
  </MemoryRouter>
);

describe('edit-awareness mount race', () => {
  it('broadcasts the editing slot even when the panel is open on first mount', () => {
    render(tree(<OpenOnMountPanel />));

    // The SUBSCRIBED handler tracks the populated infoRef; with the pendingEditRef
    // stash, that payload carries the editing slot the child set pre-populate.
    expect(lastChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({ editing: { entityType: 'show', entityId: 's1' } })
    );
  });
});
