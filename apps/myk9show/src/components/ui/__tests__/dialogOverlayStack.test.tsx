/**
 * MYK9-910: every shared Dialog / AlertDialog must join the overlay stack on
 * its own, so Escape closes only the topmost surface. Real SlideOverPanel and
 * real shared dialogs throughout -- no mocks of the stack.
 */
import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { openOverlayCount } from '@/lib/overlayStack';
import SlideOverPanel from '@/components/panels/SlideOverPanel';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog/dialog';
import type { AdminGrantHistoryRow } from '@/services/database/entitlement/types';

const fetchGrantHistoryMock = vi.fn();
vi.mock('@/services/database/entitlement/admin', () => ({
  grantEntitlement: vi.fn(),
  revokeEntitlement: vi.fn(),
  fetchGrantHistory: (...args: unknown[]) => fetchGrantHistoryMock(...args),
}));
vi.mock('@/lib/notifications', () => ({ notifications: { success: vi.fn(), error: vi.fn() } }));

import { ComplimentaryPremiumSection } from '@/components/panels/edit/ComplimentaryPremiumSection';

const activeGrant: AdminGrantHistoryRow = {
  id: 'grant-1',
  person_id: 'person-1',
  grant_type: 'complimentary',
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  reason: 'Beta tester',
  granted_by_person_id: 'admin-1',
  created_at: new Date(Date.now() - 86400000).toISOString(),
  revoked_at: null,
  revoked_by_person_id: null,
  revoke_reason: null,
  superseded_at: null,
  superseded_by_grant_id: null,
};

/**
 * Where the key lands. Base UI's popup stops a keydown that targets an element
 * inside it, so a focused-in-popup Escape never reaches the panel's document
 * listener. When focus has fallen to <body> (trigger unmounted, click on
 * non-focusable chrome) it does, and only the overlay stack protects the panel.
 */
type Source = 'focused' | 'body';
const SOURCES: Source[] = ['focused', 'body'];
async function pressEscape(user: ReturnType<typeof userEvent.setup>, source: Source) {
  if (source === 'focused') await user.keyboard('{Escape}');
  else fireEvent.keyDown(document.body, { key: 'Escape' });
}

beforeEach(() => {
  fetchGrantHistoryMock.mockReset();
  fetchGrantHistoryMock.mockResolvedValue([activeGrant]);
});

function AlertOverPanel({ onPanelClose }: { onPanelClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <SlideOverPanel open onClose={onPanelClose} title="Edit show">
      <button onClick={() => setOpen(true)}>ask</button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>Unsaved.</AlertDialogDescription>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </SlideOverPanel>
  );
}

function NestedOverPanel({ onPanelClose }: { onPanelClose: () => void }) {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <SlideOverPanel open onClose={onPanelClose} title="Edit show">
      <button onClick={() => setOuter(true)}>open outer</button>
      <Dialog open={outer} onOpenChange={setOuter}>
        <DialogContent>
          <DialogTitle>Outer dialog</DialogTitle>
          <DialogDescription>outer</DialogDescription>
          <button onClick={() => setInner(true)}>open inner</button>
          <AlertDialog open={inner} onOpenChange={setInner}>
            <AlertDialogContent>
              <AlertDialogTitle>Inner confirm</AlertDialogTitle>
              <AlertDialogDescription>inner</AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </SlideOverPanel>
  );
}

describe('shared dialogs join the overlay stack (MYK9-910)', () => {
  it.each(SOURCES)(
    'Escape closes an AlertDialog and leaves the panel open (Escape from %s)',
    async source => {
      const onPanelClose = vi.fn();
      const user = userEvent.setup();
      render(<AlertOverPanel onPanelClose={onPanelClose} />);
      await user.click(screen.getByText('ask'));
      expect(await screen.findByText('Discard changes?')).toBeInTheDocument();

      await pressEscape(user, source);

      await waitFor(() => expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument());
      expect(onPanelClose).not.toHaveBeenCalled();
      expect(openOverlayCount()).toBe(1);
    }
  );

  it.each(SOURCES)(
    'Escape closes the real premium revoke dialog and leaves the panel open (Escape from %s)',
    async source => {
      const onPanelClose = vi.fn();
      const user = userEvent.setup();
      render(
        <SlideOverPanel open onClose={onPanelClose} title="Edit show">
          <ComplimentaryPremiumSection personId="person-1" />
        </SlideOverPanel>
      );
      await user.click(await screen.findByRole('button', { name: /^revoke$/i }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(/revoke complimentary premium/i)).toBeInTheDocument();

      await pressEscape(user, source);

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(onPanelClose).not.toHaveBeenCalled();
    }
  );

  it.each(SOURCES)(
    'nested dialog over dialog over panel: each Escape closes only the top one (Escape from %s)',
    async source => {
      const onPanelClose = vi.fn();
      const user = userEvent.setup();
      render(<NestedOverPanel onPanelClose={onPanelClose} />);
      await user.click(screen.getByText('open outer'));
      await user.click(await screen.findByText('open inner'));
      expect(await screen.findByText('Inner confirm')).toBeInTheDocument();
      expect(openOverlayCount()).toBe(3);

      await pressEscape(user, source);
      await waitFor(() => expect(screen.queryByText('Inner confirm')).not.toBeInTheDocument());
      expect(screen.getByText('Outer dialog')).toBeInTheDocument();
      expect(onPanelClose).not.toHaveBeenCalled();

      await pressEscape(user, source);
      await waitFor(() => expect(screen.queryByText('Outer dialog')).not.toBeInTheDocument());
      expect(onPanelClose).not.toHaveBeenCalled();
      expect(openOverlayCount()).toBe(1);

      await pressEscape(user, source);
      expect(onPanelClose).toHaveBeenCalledTimes(1);
    }
  );
});
