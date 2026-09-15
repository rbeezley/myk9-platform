import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CommonDialog } from './CommonDialog';
import SlideOverPanel from '@/components/panels/SlideOverPanel';

describe('CommonDialog Escape handling', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <CommonDialog open onClose={onClose} title="Delete registration">
        <p>Are you sure?</p>
      </CommonDialog>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores keys other than Escape', () => {
    const onClose = vi.fn();
    render(
      <CommonDialog open onClose={onClose} title="Delete registration">
        <p>Are you sure?</p>
      </CommonDialog>
    );

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing while closed', () => {
    const onClose = vi.fn();
    render(
      <CommonDialog open={false} onClose={onClose} title="Delete registration">
        <p>Are you sure?</p>
      </CommonDialog>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});

// MYK9-523: CommonDialog previously had no Escape handling and was not part
// of SlideOverPanel's open-overlay stack, so with a CommonDialog opened over
// a SlideOverPanel, Escape fell through and closed the panel behind it,
// leaving the dialog floating over a bare page. The Dog Details delete
// confirmation (a CommonDialog opened over ManageRegistrationsPanel, a
// SlideOverPanel) is the flow that surfaced this. Both nesting orders are
// covered here since either primitive can now open on top of the other. Each
// wrapper actually closes on its own onClose (rather than a bare mock) so a
// closed surface leaves the shared stack and the SECOND Escape genuinely
// reaches the surface underneath — a mock that doesn't unmount would leave
// the "closed" surface still registered as topmost.
describe('CommonDialog and SlideOverPanel share one open-overlay stack', () => {
  function PanelThenDialog({
    onClosePanel,
    onCloseDialog,
  }: {
    onClosePanel: () => void;
    onCloseDialog: () => void;
  }) {
    const [panelOpen, setPanelOpen] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(true);
    return (
      <>
        <SlideOverPanel
          open={panelOpen}
          onClose={() => {
            onClosePanel();
            setPanelOpen(false);
          }}
          title="Manage registrations"
        >
          <p>Panel body</p>
        </SlideOverPanel>
        <CommonDialog
          open={dialogOpen}
          onClose={() => {
            onCloseDialog();
            setDialogOpen(false);
          }}
          title="Delete registration"
        >
          <p>Are you sure?</p>
        </CommonDialog>
      </>
    );
  }

  function DialogThenPanel({
    onCloseDialog,
    onClosePanel,
  }: {
    onCloseDialog: () => void;
    onClosePanel: () => void;
  }) {
    const [dialogOpen, setDialogOpen] = useState(true);
    const [panelOpen, setPanelOpen] = useState(true);
    return (
      <>
        <CommonDialog
          open={dialogOpen}
          onClose={() => {
            onCloseDialog();
            setDialogOpen(false);
          }}
          title="Achievement details"
        >
          <p>Dialog body</p>
        </CommonDialog>
        <SlideOverPanel
          open={panelOpen}
          onClose={() => {
            onClosePanel();
            setPanelOpen(false);
          }}
          title="Nested panel"
        >
          <p>Panel body</p>
        </SlideOverPanel>
      </>
    );
  }

  it('closes only the dialog when a CommonDialog opens over a SlideOverPanel, then falls through', () => {
    const onClosePanel = vi.fn();
    const onCloseDialog = vi.fn();

    render(<PanelThenDialog onClosePanel={onClosePanel} onCloseDialog={onCloseDialog} />);

    // The dialog opened after (over) the panel, so it is topmost.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseDialog).toHaveBeenCalledTimes(1);
    expect(onClosePanel).not.toHaveBeenCalled();

    // With the dialog closed (and off the stack), the panel is topmost.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClosePanel).toHaveBeenCalledTimes(1);
  });

  it('closes only the panel when a SlideOverPanel opens over a CommonDialog, then falls through', () => {
    const onCloseDialog = vi.fn();
    const onClosePanel = vi.fn();

    render(<DialogThenPanel onCloseDialog={onCloseDialog} onClosePanel={onClosePanel} />);

    // The panel opened after (over) the dialog, so it is topmost.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClosePanel).toHaveBeenCalledTimes(1);
    expect(onCloseDialog).not.toHaveBeenCalled();

    // With the panel closed (and off the stack), the dialog is topmost.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseDialog).toHaveBeenCalledTimes(1);
  });

  it('renders both surfaces before Escape is pressed', () => {
    render(
      <PanelThenDialog onClosePanel={vi.fn()} onCloseDialog={vi.fn()} />
    );

    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});
