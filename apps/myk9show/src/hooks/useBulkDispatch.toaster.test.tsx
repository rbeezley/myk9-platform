/**
 * MYK9-593, the load-bearing half of the retry-while-busy coverage.
 *
 * The sibling `useBulkDispatch.test.ts` mocks sonner wholesale, so it can only
 * assert that `toast.error` was CALLED a second time. That is green in exactly
 * the world the bug describes — sonner's action button runs
 * `onClick(event); if (event.defaultPrevented) return; deleteToast();`
 * (verified in node_modules/sonner/dist/index.mjs at 2.0.8), so a re-show
 * without `preventDefault` is dismissed the instant it is refreshed and the
 * user still sees nothing.
 *
 * These tests mount the REAL <Toaster/> — no vi.mock('sonner') in this file —
 * and assert what survives in the DOM after the click.
 */
import { useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { afterEach, describe, expect, it } from 'vitest';
import { useBulkDispatch } from './useBulkDispatch';

interface Item {
  id: string;
}

/**
 * sonner's `deleteToast()` marks the toast removed and unmounts it
 * TIME_BEFORE_UNMOUNT (200ms at 2.0.8) later, so asserting straight after the
 * click passes even when the toast is on its way out. Every assertion about a
 * toast SURVIVING a click waits past that window first.
 */
const SONNER_UNMOUNT_MS = 200;
const settleDismissal = () =>
  new Promise<void>(resolve => setTimeout(resolve, SONNER_UNMOUNT_MS * 3));

/** Resolves when the caller says so, so a batch can be parked in flight. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

function Harness({
  hold,
  bravoRecovers = false,
}: {
  hold: Promise<void>;
  bravoRecovers?: boolean;
}) {
  const { run } = useBulkDispatch<Item>({ getLabel: i => i.id });
  // Per-instance, not module scope: a shuffled run must not inherit a count.
  const bravoAttempts = useRef(0);
  return (
    <div>
      <button
        onClick={() => {
          void run([{ id: 'alpha' }, { id: 'bravo' }], async i => {
            if (i.id !== 'bravo') return;
            bravoAttempts.current += 1;
            // With `bravoRecovers` the retry succeeds, so a dispatched retry
            // ends in a success toast and the error toast must be gone.
            if (bravoRecovers && bravoAttempts.current > 1) return;
            throw new Error('network down');
          });
        }}
      >
        batch one
      </button>
      <button
        onClick={() => {
          void run([{ id: 'charlie' }, { id: 'delta' }], async i => {
            if (i.id === 'delta') throw new Error('gateway timeout');
          });
        }}
      >
        batch two
      </button>
      <button
        onClick={() => {
          void run([{ id: 'echo' }], async () => {
            await hold;
          });
        }}
      >
        slow batch
      </button>
      <Toaster />
    </div>
  );
}

describe('useBulkDispatch retry against the real Toaster', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('keeps the failure report on screen when the retry is latched out', async () => {
    const { promise, release } = deferred();
    render(<Harness hold={promise} />);

    fireEvent.click(screen.getByRole('button', { name: 'batch one' }));
    await screen.findByText(/bravo: network down/);

    // A second batch takes the in-flight latch and stays there.
    fireEvent.click(screen.getByRole('button', { name: 'slow batch' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Retry failed' }));

    // Past sonner's removal window, so this cannot pass on a toast that is
    // merely mid-dismissal.
    await act(async () => {
      await settleDismissal();
    });

    // The click must not take the report with it: the failure line is still
    // there, and the toast now explains why nothing ran.
    expect(screen.getByText(/Still working on the previous batch/)).toBeInTheDocument();
    expect(screen.getByText(/bravo: network down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry failed' })).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByText(/echo/)).not.toBeInTheDocument());
  });

  // The other half of the same decision: only the busy branch opts out of
  // sonner's dismissal. A retry that actually dispatches still closes its toast.
  it('dismisses the toast when the retry actually dispatches', async () => {
    const { promise } = deferred();
    render(<Harness hold={promise} bravoRecovers />);

    fireEvent.click(screen.getByRole('button', { name: 'batch one' }));
    await screen.findByText(/bravo: network down/);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry failed' }));

    await waitFor(() => expect(screen.queryByText(/bravo: network down/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Still working on the previous batch/)).not.toBeInTheDocument();
  });

  // `toastId` lives in the per-`showSummary` closure, so a second batch gets its
  // own toast instead of overwriting the first batch's failure report.
  it('gives each batch its own toast rather than clobbering the previous one', async () => {
    const { promise } = deferred();
    render(<Harness hold={promise} />);

    fireEvent.click(screen.getByRole('button', { name: 'batch one' }));
    await screen.findByText(/bravo: network down/);
    fireEvent.click(screen.getByRole('button', { name: 'batch two' }));
    await screen.findByText(/delta: gateway timeout/);

    await act(async () => {
      await settleDismissal();
    });
    expect(screen.getByText(/bravo: network down/)).toBeInTheDocument();
    expect(screen.getByText(/delta: gateway timeout/)).toBeInTheDocument();
  });
});
