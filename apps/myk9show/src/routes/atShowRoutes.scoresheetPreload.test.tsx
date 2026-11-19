/** MYK9-2224: opening the scoresheet loads the entry list chunks while the network is still up. */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Routes } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';

const loaded = vi.hoisted(() => ({ list: 0, combined: 0 }));

vi.mock('@/features/at-show/AtShowScoresheetPage', () => ({
  default: () => <div>scoresheet</div>,
}));
vi.mock('@/features/at-show/AtShowAccessGate', () => ({
  AtShowAccessGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/at-show/RingsideSessionHeartbeat', () => ({
  RingsideSessionHeartbeat: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/at-show/RingsideShowBoundary', () => ({
  RingsideShowBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/show-presence/ShowPresenceProvider', () => ({
  ShowPresenceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/at-show/staleClass/StaleClassPromptHost', () => ({
  StaleClassPromptHost: () => null,
}));

// Each test imports the routes fresh, so the mocked list modules count this test's requests only.
async function freshRoutes() {
  vi.resetModules();
  loaded.list = 0;
  loaded.combined = 0;
  vi.doMock('@/features/at-show/AtShowEntryListPage', () => {
    loaded.list += 1;
    return { default: () => <div>entry list</div> };
  });
  vi.doMock('@/features/at-show/AtShowCombinedEntryListPage', () => {
    loaded.combined += 1;
    return { default: () => <div>combined list</div> };
  });
  return (await import('./atShowRoutes')).AtShowRoutes;
}

describe('at-show scoresheet route preload', () => {
  const SCORESHEET = '/at-show/show-1/class/class-1/score/entry-1';
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests both entry list chunks once the scoresheet is open', async () => {
    const AtShowRoutes = await freshRoutes();
    render(<Routes>{AtShowRoutes()}</Routes>, { initialRoute: SCORESHEET });
    expect(await screen.findByText('scoresheet')).toBeInTheDocument();
    await waitFor(() => {
      expect(loaded.list).toBe(1);
      expect(loaded.combined).toBe(1);
    });
  });

  it('opened offline, waits for the network before requesting them (a failed import is cached)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const AtShowRoutes = await freshRoutes();
    render(<Routes>{AtShowRoutes()}</Routes>, { initialRoute: SCORESHEET });
    expect(await screen.findByText('scoresheet')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(loaded.list).toBe(0);
    expect(loaded.combined).toBe(0);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(loaded.list).toBe(1);
      expect(loaded.combined).toBe(1);
    });
  });
});
