/**
 * MYK9-1779: browser Back on a dirty page, then the prompt's leave button, must leave.
 *
 * Back is a POP navigation. React Router replays a proceeded POP only after the revert of
 * the blocked one has landed, one task later. The dialog's leave button used to also close
 * the dialog, and its close handler reset the blocker inside that window, so the replayed
 * POP was blocked again: the page reopened with the prompt, forever. A link or Cancel is a
 * PUSH, which proceeds synchronously, so only Back looped.
 */
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { render as rawRender, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { UnsavedChangesRouteGuardProvider } from './UnsavedChangesRouteGuard';
import { ScoresheetLeaveGuard } from './ScoresheetLeaveGuard';

function renderDirtySheet(mode: 'provider' | 'standalone') {
  const sheet = (
    <>
      <ScoresheetLeaveGuard isDirty />
      <div>Scoresheet</div>
    </>
  );
  const router = createMemoryRouter(
    [
      { path: '/list', element: <div>Entry List</div> },
      {
        path: '/sheet',
        element:
          mode === 'provider' ? (
            <UnsavedChangesRouteGuardProvider>{sheet}</UnsavedChangesRouteGuardProvider>
          ) : (
            sheet
          ),
      },
    ],
    { initialEntries: ['/list', '/sheet'], initialIndex: 1 }
  );
  rawRender(<RouterProvider router={router} />);
  return router;
}

describe.each(['provider', 'standalone'] as const)('Back, then Discard (%s guard)', mode => {
  afterEach(cleanup);

  it('leaves to the previous page and does not ask again', async () => {
    const router = renderDirtySheet(mode);
    const user = userEvent.setup();

    await act(async () => {
      void router.navigate(-1);
    });
    expect(await screen.findByText('Discard this score?')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sheet');

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(router.state.location.pathname).toBe('/list');
    expect(screen.getByText('Entry List')).toBeInTheDocument();
    expect(screen.queryByText('Discard this score?')).not.toBeInTheDocument();
  });

  it('Keep scoring stays on the page with the work', async () => {
    const router = renderDirtySheet(mode);
    const user = userEvent.setup();

    await act(async () => {
      void router.navigate(-1);
    });
    await user.click(await screen.findByRole('button', { name: 'Keep scoring' }));

    expect(router.state.location.pathname).toBe('/sheet');
    expect(screen.getByText('Scoresheet')).toBeInTheDocument();
    expect(screen.queryByText('Discard this score?')).not.toBeInTheDocument();
  });
});
