/** MYK9-2224: opening the scoresheet loads the entry list chunks while the network is still up. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, createRoutesFromElements } from 'react-router-dom';

const loaded = vi.hoisted(() => ({ list: 0, combined: 0 }));

vi.mock('@/features/at-show/AtShowEntryListPage', () => {
  loaded.list += 1;
  return { default: () => <div>entry list</div> };
});
vi.mock('@/features/at-show/AtShowCombinedEntryListPage', () => {
  loaded.combined += 1;
  return { default: () => <div>combined list</div> };
});
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

import { AtShowRoutes } from './atShowRoutes';

describe('at-show scoresheet route preload', () => {
  it('requests both entry list chunks once the scoresheet is open', async () => {
    const router = createMemoryRouter(createRoutesFromElements(AtShowRoutes()), {
      initialEntries: ['/at-show/show-1/class/class-1/score/entry-1'],
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('scoresheet')).toBeInTheDocument();
    await waitFor(() => {
      expect(loaded.list).toBe(1);
      expect(loaded.combined).toBe(1);
    });
  });
});
