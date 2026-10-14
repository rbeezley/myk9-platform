/**
 * MYK9-1116: the panel variant of Add Dog hosts its registration form as a
 * sub-mode of its own slide-out, not a second slide-out stacked on it (the
 * inline variant's contract from MYK9-1081, now shared by the panel host).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AddDogPanel } from '../index';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addFirstRegistration,
  dialogs,
  fillDogBasics,
  fillRegistration,
  JOURNEY_TIMEOUT_MS,
} from '@/test/quickCreate/quickCreateFlowKit';

vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

beforeEach(() => {
  resetQuickCreateMocks();
});

function renderPanel(onClose = vi.fn()) {
  return render(
    <AddDogPanel
      open
      onClose={onClose}
      onDogCreated={vi.fn()}
      userRole={UserRole.SECRETARY}
      currentUserPersonId="person-1"
    />
  );
}

/** Add Dog's two first steps: the first registration, then the Essential fields. */
async function startDog(user: ReturnType<typeof renderPanel>['user'], callName = 'Ziggy') {
  await addFirstRegistration(user);
  await fillDogBasics(user, callName);
}

async function openAddRegistration(user: ReturnType<typeof renderPanel>['user']) {
  await user.click(screen.getByRole('tab', { name: /Registration/ }));
  await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));
}

describe(
  'AddDogPanel panel registration sub-mode (MYK9-1116)',
  { timeout: JOURNEY_TIMEOUT_MS },
  () => {
    it('opens Add New Registration inside the one panel', async () => {
      const { user } = renderPanel();
      await startDog(user);
      await openAddRegistration(user);

      expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
      expect(dialogs()).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Add New Registration' })).toBeInTheDocument();
    });

    it('opens Edit on an existing registration inside the one panel', async () => {
      const { user } = renderPanel();
      await startDog(user);
      await user.click(screen.getByRole('tab', { name: /Registration/ }));
      const edit = await screen.findByRole('button', { name: /Edit AKC.*DN12345601/ });
      await user.click(edit);

      expect(await screen.findByLabelText(/Registered Name/i)).toHaveValue(
        'Mailbox Special Delivery'
      );
      expect(dialogs()).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Edit Registration' })).toBeInTheDocument();
    });

    it('keeps the dog form values across the sub-mode', async () => {
      const { user } = renderPanel();
      await startDog(user, 'Ziggy');
      await openAddRegistration(user);
      await fillRegistration(user, 'DN22222201');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Edit AKC.*DN22222201/ })).toBeVisible()
      );
      await user.click(screen.getByRole('tab', { name: /Essential|Basic/ }));

      expect(screen.getByLabelText(/Call Name/i)).toHaveValue('Ziggy');
    });

    it('Escape leaves the sub-mode first and keeps the panel open', async () => {
      const onClose = vi.fn();
      const { user } = renderPanel(onClose);
      await startDog(user);
      await openAddRegistration(user);
      await screen.findByLabelText(/Registered Name/i);

      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByLabelText(/Registered Name/i)).toBeNull());
      expect(screen.getByRole('button', { name: /Add New Registration/ })).toBeVisible();
      expect(dialogs()).toHaveLength(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Back leaves the sub-mode first and keeps the panel open', async () => {
      const onClose = vi.fn();
      const { user } = renderPanel(onClose);
      await startDog(user);
      await openAddRegistration(user);
      await screen.findByLabelText(/Registered Name/i);

      await user.click(screen.getByRole('button', { name: /Back/ }));

      await waitFor(() => expect(screen.queryByLabelText(/Registered Name/i)).toBeNull());
      expect(dialogs()).toHaveLength(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('focuses the first registration field, then returns to Add New Registration', async () => {
      const { user } = renderPanel();
      await startDog(user);
      await openAddRegistration(user);
      await screen.findByLabelText(/Registered Name/i);
      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById('organization'))
      );

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: /Add New Registration/ })
        )
      );
    });

    it('returns focus to the edited row Edit button', async () => {
      const { user } = renderPanel();
      await startDog(user);
      await user.click(screen.getByRole('tab', { name: /Registration/ }));
      const edit = await screen.findByRole('button', { name: /Edit AKC.*DN12345601/ });
      await user.click(edit);
      await screen.findByLabelText(/Registered Name/i);

      await user.keyboard('{Escape}');

      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: /Edit AKC.*DN12345601/ })
        )
      );
    });

    it('saves the registration with the dog', async () => {
      const { user } = renderPanel();
      await startDog(user);
      await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
      await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

      await waitFor(() =>
        expect(mocks.addDog).toHaveBeenCalledWith(
          expect.objectContaining({
            registrations: [expect.objectContaining({ number: 'DN12345601' })],
          }),
          {}
        )
      );
    });
  }
);

describe(
  'AddDogPanel panel host details (MYK9-1116 review round 1)',
  { timeout: JOURNEY_TIMEOUT_MS },
  () => {
    it('keeps the closing panel as it was through its exit animation', async () => {
      const onClose = vi.fn();
      const panel = (open: boolean) => (
        <AddDogPanel
          open={open}
          onClose={onClose}
          onDogCreated={vi.fn()}
          userRole={UserRole.SECRETARY}
          currentUserPersonId="person-1"
        />
      );
      // Mounted closed, then opened, as every page does: only that transition animates.
      const { user, rerender } = render(panel(false));
      rerender(panel(true));
      await startDog(user);
      await openAddRegistration(user);
      expect(
        await screen.findByRole('heading', { name: 'Add New Registration' })
      ).toBeInTheDocument();

      rerender(panel(false));

      // While the panel slides out it still shows what the secretary was looking at, not a
      // freshly reset Add Dog form.
      expect(screen.getByRole('heading', { name: 'Add New Registration' })).toBeInTheDocument();
      expect(screen.getByLabelText(/Registered Name/i)).toBeInTheDocument();
      await waitFor(() => expect(dialogs()).toHaveLength(0));
    });

    it('keeps a gap between the dog photo and the Call Name field', async () => {
      const { user } = renderPanel();
      await user.click(await screen.findByRole('button', { name: /No registration number yet/ }));
      const photo = document.getElementById('dog-photo-button');
      expect(photo).not.toBeNull();
      expect(photo!.parentElement).toHaveClass('gap-4');
    });
  }
);
