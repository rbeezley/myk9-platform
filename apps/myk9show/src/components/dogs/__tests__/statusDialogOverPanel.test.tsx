/**
 * `DogStatusDialog` raised from inside the Edit Dog `SlideOverPanel`. Both
 * properties here are behavioural, against the real primitives — the earlier
 * version of this suite asserted the `isTopmostOverlay` predicate instead, which
 * stays green if `SlideOverPanel` ever stops consulting it.
 *
 * 1. Escape closes the DIALOG and leaves the panel (and its unsaved edits) open.
 * 2. Body scroll is restored once both are gone, in EVERY closing order —
 *    including the one React actually produces when a route change unmounts the
 *    pair together, which is what leaked `overflow: hidden` permanently.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { openOverlayCount } from '@/lib/overlayStack';
import SlideOverPanel from '@/components/panels/SlideOverPanel';
import DogStatusDialog from '../DogStatusDialog';

/** Mirrors production: the dialog stays MOUNTED and `open` is toggled. */
function Harness({
  panelOpen,
  dialogOpen,
  onPanelClose = () => {},
}: {
  panelOpen: boolean;
  dialogOpen: boolean;
  onPanelClose?: () => void;
}) {
  return (
    <>
      <SlideOverPanel open={panelOpen} onClose={onPanelClose} title="Edit Dog">
        <input aria-label="Call name" defaultValue="Maple" />
      </SlideOverPanel>
      <DogStatusDialog
        open={dialogOpen}
        onOpenChange={() => {}}
        dogName="Maple"
        currentStatus="active"
        onSave={vi.fn()}
      />
    </>
  );
}

afterEach(() => {
  document.body.style.overflow = '';
});

describe('status dialog raised over the Edit Dog panel', () => {
  it('lets Escape close the dialog without closing the panel underneath', () => {
    const onPanelClose = vi.fn();
    function Live() {
      const [dialogOpen, setDialogOpen] = useState(false);
      return (
        <>
          <button onClick={() => setDialogOpen(true)}>open status</button>
          <SlideOverPanel open onClose={onPanelClose} title="Edit Dog">
            <input aria-label="Call name" defaultValue="Maple" />
          </SlideOverPanel>
          <DogStatusDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            dogName="Maple"
            currentStatus="active"
            onSave={vi.fn()}
          />
        </>
      );
    }
    render(<Live />);
    fireEvent.click(screen.getByText('open status'));
    expect(screen.getByRole('heading', { name: 'Change Status' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('heading', { name: 'Change Status' })).not.toBeInTheDocument();
    expect(onPanelClose).not.toHaveBeenCalled();
  });

  // React unmounts children in tree order, so the PANEL's cleanup runs first
  // and sees the dialog still registered. Before the release moved into
  // `overlayStack`, that skipped the unset and nothing else restored it.
  it('restores body scroll when a route change unmounts panel and dialog together', () => {
    const { unmount } = render(<Harness panelOpen dialogOpen />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(openOverlayCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('restores body scroll when the panel closes first and the dialog lingers', () => {
    const { rerender } = render(<Harness panelOpen dialogOpen />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Harness panelOpen={false} dialogOpen />);
    rerender(<Harness panelOpen={false} dialogOpen={false} />);

    expect(openOverlayCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('restores body scroll when the dialog closes first, then the panel', () => {
    const { rerender } = render(<Harness panelOpen dialogOpen />);

    rerender(<Harness panelOpen dialogOpen={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Harness panelOpen={false} dialogOpen={false} />);

    expect(openOverlayCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  // The dialog is permanently mounted in production and only its `open` flips,
  // so a stack entry left behind by open->false would leave the panel unable to
  // answer Escape ever again.
  it('hands Escape back to the panel once the dialog has closed', () => {
    const onPanelClose = vi.fn();
    const { rerender } = render(<Harness panelOpen dialogOpen onPanelClose={onPanelClose} />);
    rerender(<Harness panelOpen dialogOpen={false} onPanelClose={onPanelClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onPanelClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the page locked while the dialog is open over a still-open panel', () => {
    const { rerender } = render(<Harness panelOpen dialogOpen={false} />);
    rerender(<Harness panelOpen dialogOpen />);
    expect(document.body.style.overflow).toBe('hidden');
  });
});
