/**
 * MYK9-88 — the toaster must not cover the control beneath it, and must not
 * carry a stale CTA onto an unrelated screen.
 *
 * The audit's data loss needed BOTH: the toast sat on "Save Changes" (so the
 * tap missed) and it was stale (so the tap navigated somewhere the message no
 * longer explained). Each is asserted separately here, because fixing one and
 * not the other still loses the edit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppToaster } from '../AppToaster';
import { useActionBarStore } from '@/store/actionBarStore';

beforeEach(() => {
  useActionBarStore.setState({ heights: {} });
  toast.dismiss();
});

/**
 * The sonner viewport publishes its resolved offsets as CSS custom properties
 * (`--offset-bottom`, `--mobile-offset-bottom`) — but it only renders that
 * element once a toast exists. Before then there is just an empty <section>,
 * so a query without a live toast reads '' and would pass any "not present"
 * assertion vacuously.
 */
async function toasterOffset(container: HTMLElement): Promise<string> {
  toast('probe');
  await waitFor(() => {
    expect(container.querySelector('[data-sonner-toaster]')).not.toBeNull();
  });
  return container.querySelector('[data-sonner-toaster]')!.getAttribute('style') ?? '';
}

function Harness({ initial = '/a' }: { initial?: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/a" element={<Jumper to="/b" />} />
        <Route path="/b" element={<div>page b</div>} />
      </Routes>
      <AppToaster />
    </MemoryRouter>
  );
}

function Jumper({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go
    </button>
  );
}

describe('AppToaster', () => {
  it('sits at the safe-area inset when no action bar is mounted', async () => {
    const { container } = render(<Harness />);
    const style = await toasterOffset(container);
    expect(style).toContain('--offset-bottom: max(1rem, env(safe-area-inset-bottom))');
    // No bar mounted means no extra pixels reserved.
    expect(style).not.toMatch(/--offset-bottom:[^;]*\+\s*\d+px/);
  });

  it('lifts above a mounted action bar, on desktop and mobile alike', async () => {
    const { container } = render(<Harness />);
    act(() => useActionBarStore.getState().setHeight('panel', 72));
    const style = await toasterOffset(container);
    // 72px bar + 12px gap. Both offsets matter: the audit's loss happened on a
    // 390px-wide phone, which reads --mobile-offset-bottom.
    expect(style).toContain('--offset-bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 84px)');
    expect(style).toContain(
      '--mobile-offset-bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 84px)'
    );
  });

  it('drops back down when the action bar unmounts', async () => {
    const { container } = render(<Harness />);
    act(() => useActionBarStore.getState().setHeight('panel', 72));
    expect(await toasterOffset(container)).toContain('+ 84px');

    act(() => useActionBarStore.getState().unregister('panel'));
    await waitFor(() => {
      const style = container.querySelector('[data-sonner-toaster]')!.getAttribute('style') ?? '';
      expect(style).not.toMatch(/--offset-bottom:[^;]*\+\s*\d+px/);
    });
  });

  it('clears a STALE toast when the route changes', async () => {
    render(<Harness />);
    toast('Enter a show');
    expect(await screen.findByText('Enter a show')).toBeInTheDocument();

    // Age it past the navigation-feedback grace window: this is the audit's
    // scenario, a CTA left over from an earlier screen rather than feedback
    // about the navigation now happening.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 5_000);

    screen.getByRole('button', { name: 'go' }).click();

    // It must not remain clickable over the next screen.
    await waitFor(() => {
      expect(screen.queryByText('Enter a show')).not.toBeInTheDocument();
    });
    vi.mocked(Date.now).mockRestore();
  });

  it('keeps a toast raised as part of the navigating action', async () => {
    // Deleting a record raises "Deleted" and then navigates away in the same
    // tick. A blanket dismiss on route change swallows the only confirmation
    // the user ever gets — Codex caught this on the first cut.
    //
    // Asserted on the DISMISS CALL, not on the DOM: sonner animates a toast out,
    // so the node lingers and `getByText` still finds it for a beat. A DOM
    // assertion here passes against the blanket-dismiss bug — verified, which
    // is the only reason this test is written this way.
    render(<Harness />);
    const dismiss = vi.spyOn(toast, 'dismiss');
    toast.success('Dog deleted');
    expect(await screen.findByText('Dog deleted')).toBeInTheDocument();

    screen.getByRole('button', { name: 'go' }).click();
    await screen.findByText('page b');

    // Nothing is stale, so nothing should be dismissed — and in particular
    // `dismiss()` must never be called bare, which clears every toast.
    expect(dismiss).not.toHaveBeenCalledWith();
    expect(dismiss).not.toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('keeps a toast raised on the initial render', async () => {
    // The dismiss effect also runs on mount; without a first-render guard it
    // would swallow a toast raised by the landing route itself.
    const spy = vi.spyOn(toast, 'dismiss');
    render(<Harness />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
