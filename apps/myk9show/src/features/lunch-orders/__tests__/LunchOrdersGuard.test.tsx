import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render as rawRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { UnsavedChangesRouteGuardProvider } from '@/components/navigation/UnsavedChangesRouteGuard';
import { ShowDeskToolPanel } from '@/features/show-map/ShowDeskToolsSheet';
import { LunchOrdersTool } from '../LunchOrdersTool';

vi.mock('../lunchOrdersService', () => ({
  lunchOrdersService: {
    listForTrial: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../judgesOnDays', async importOriginal => ({
  ...(await importOriginal<typeof import('../judgesOnDays')>()),
  useJudgesOnDays: () => ({
    byTrial: new Map([['trial-1', [{ person_id: 'p-judge', judge_name: 'Jo Judge' }]]]),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../useLunchOrders', async importOriginal => ({
  ...(await importOriginal<typeof import('../useLunchOrders')>()),
  useVolunteersOnDays: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

const tools = [
  {
    id: 'lunch-orders',
    group: 'show-logistics',
    title: 'Lunch orders',
    summary: 'Plan lunch',
    content: <LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Sat' }]} />,
  },
  {
    id: 'volunteers',
    group: 'show-logistics',
    title: 'Volunteers',
    summary: 'Helpers',
    content: <p>Volunteers body</p>,
  },
] as never;

// A data router, as in the app, so the real route blocker is in play.
function renderDesk() {
  const router = createMemoryRouter(
    [
      {
        path: '/shows/:id',
        element: (
          <UnsavedChangesRouteGuardProvider>
            <ShowDeskToolPanel tools={tools} />
          </UnsavedChangesRouteGuardProvider>
        ),
      },
      { path: '/earlier', element: <p>Earlier page</p> },
    ],
    { initialEntries: ['/earlier', '/shows/show-1?tool=lunch-orders'], initialIndex: 1 }
  );
  rawRender(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

const PROMPT = 'You have unsaved lunch orders. Leave without saving?';

describe('Lunch orders leave guard on a data router', () => {
  it('browser Back with unsaved text asks first and Stay keeps the form; Leave lets navigation through', async () => {
    const user = userEvent.setup();
    const router = renderDesk();
    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');

    await act(async () => {
      void router.navigate(-1);
    });
    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/shows/show-1');

    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Lunch order for Jo Judge')).toHaveValue('Wrap');
    await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeInTheDocument());

    await act(async () => {
      void router.navigate('/earlier');
    });
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/earlier'));
  });

  it('switching to another tool with unsaved text asks first', async () => {
    const user = userEvent.setup();
    const router = renderDesk();
    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');

    await act(async () => {
      void router.navigate('/shows/show-1?tool=volunteers');
    });

    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tool=lunch-orders');
  });

  it('Escape then Leave closes the panel without the router prompt stacking on top', async () => {
    const user = userEvent.setup();
    const router = renderDesk();
    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');

    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it('an unsent Add person name counts as unsaved', async () => {
    const user = userEvent.setup();
    const router = renderDesk();
    await user.type(await screen.findByLabelText('Add person'), 'Pat Guest');

    await act(async () => {
      void router.navigate(-1);
    });

    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
  });
});
