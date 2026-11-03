/**
 * MYK9-1552: a back navigation that lands right after a result click or a typed
 * time must reach the "Discard this score?" prompt. The dirty value used to
 * travel sheet effect -> host state -> guard effect -> registry state before the
 * router blocker saw it; a popstate inside that window passed unguarded.
 *
 * The edit and the navigation run outside `act`, one macrotask apart, the way a
 * trusted click and a popstate arrive in a browser. Against the pre-fix guard
 * (state-only dirty value) four of these six fail.
 */
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { render as rawRender, screen, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useScoresheetLeave } from '@myk9/scoring-ui';
import { UnsavedChangesRouteGuardProvider } from './UnsavedChangesRouteGuard';
import { ScoresheetLeaveGuard } from './ScoresheetLeaveGuard';
import { useScoresheetDirty } from './useScoresheetDirty';

/** Just enough of the scoring state for the real hook to compare snapshots. */
function Sheet({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [qualifying, setQualifying] = useState('');
  const [time, setTime] = useState('');
  const scoring = {
    qualifying,
    nonQualifyingReason: '',
    faultCount: 0,
    areas: [{ areaName: 'Area 1', time, found: false, correct: false }],
  } as unknown as Parameters<typeof useScoresheetLeave>[0]['scoring'];
  const { upButton } = useScoresheetLeave({ scoring, onBack: () => undefined, onDirtyChange });
  return (
    <div>
      {upButton}
      <button onClick={() => setQualifying('Q')}>Qualified</button>
      <input aria-label="Area time" value={time} onChange={e => setTime(e.target.value)} />
    </div>
  );
}

function Host() {
  const { sheetDirty, dirtyRef, onDirtyChange } = useScoresheetDirty();
  return (
    <>
      <ScoresheetLeaveGuard isDirty={sheetDirty} dirtyRef={dirtyRef} />
      <Sheet onDirtyChange={onDirtyChange} />
    </>
  );
}

function renderSheet(mode: 'provider' | 'standalone') {
  const host = <Host />;
  const router = createMemoryRouter(
    [
      { path: '/list', element: <div>Entry List</div> },
      {
        path: '/sheet',
        element:
          mode === 'provider' ? (
            <UnsavedChangesRouteGuardProvider>{host}</UnsavedChangesRouteGuardProvider>
          ) : (
            host
          ),
      },
    ],
    { initialEntries: ['/list', '/sheet'], initialIndex: 1 }
  );
  rawRender(<RouterProvider router={router} />);
  return router;
}

/** Fires `edit`, then navigates back in the next task, like a popstate. */
async function editThenBack(router: ReturnType<typeof renderSheet>, edit: () => void) {
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  g.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    edit();
    // One macrotask: the next task a popstate could arrive in.
    await new Promise(resolve => setTimeout(resolve, 0));
    void router.navigate(-1);
  } finally {
    g.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await act(async () => undefined);
}

describe.each(['provider', 'standalone'] as const)(
  'immediate Back after an edit (%s guard)',
  mode => {
    afterEach(cleanup);

    it('prompts when Back follows a result click in the same tick', async () => {
      const router = renderSheet(mode);
      await editThenBack(router, () => screen.getByText('Qualified').click());

      expect(await screen.findByText('Discard this score?')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/sheet');
    });

    it('prompts when Back follows a typed time in the same tick', async () => {
      const router = renderSheet(mode);
      const input = screen.getByLabelText('Area time') as HTMLInputElement;
      await editThenBack(router, () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, '1:05.20');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(await screen.findByText('Discard this score?')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/sheet');
    });

    it('still lets a clean sheet go back without a prompt', async () => {
      const router = renderSheet(mode);
      await editThenBack(router, () => undefined);

      expect(screen.queryByText('Discard this score?')).toBeNull();
      expect(router.state.location.pathname).toBe('/list');
    });
  }
);
