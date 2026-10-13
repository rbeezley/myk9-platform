/**
 * MYK9-1116: an exhibitor's Essential tab offers "Add dog registration", a shortcut into
 * the same registration view the Registration tab's "Add New Registration" opens. Leaving
 * that view must hand focus back to the control that opened it, not drop it on the panel
 * container. A browser walk of onboarding Add Dog found focus landing on the tab strip's
 * container at every width (2026-10-13).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AddDogPanel } from '../index';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { fillRegistration, JOURNEY_TIMEOUT_MS } from '@/test/quickCreate/quickCreateFlowKit';

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

function renderExhibitorPanel() {
  return render(
    <AddDogPanel
      open
      onClose={vi.fn()}
      onDogCreated={vi.fn()}
      userRole={UserRole.EXHIBITOR}
      currentUserPersonId="person-1"
    />
  );
}

const shortcut = () => screen.getByRole('button', { name: 'Add dog registration' });

async function openFromShortcut(user: ReturnType<typeof renderExhibitorPanel>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add dog registration' }));
  await screen.findByLabelText(/Registered Name/i);
}

describe(
  'AddDogPanel Essential-tab registration shortcut focus (MYK9-1116)',
  { timeout: JOURNEY_TIMEOUT_MS },
  () => {
    it('Escape returns focus to Add dog registration', async () => {
      const { user } = renderExhibitorPanel();
      await openFromShortcut(user);

      await user.keyboard('{Escape}');

      await waitFor(() => expect(document.activeElement).toBe(shortcut()));
    });

    it('Back returns focus to Add dog registration', async () => {
      const { user } = renderExhibitorPanel();
      await openFromShortcut(user);

      await user.click(screen.getByRole('button', { name: /^Back$/ }));

      await waitFor(() => expect(document.activeElement).toBe(shortcut()));
    });

    it('after a save removes the shortcut, focus lands on the selected tab', async () => {
      const { user } = renderExhibitorPanel();
      await openFromShortcut(user);

      await fillRegistration(user);

      // The shortcut only shows while the dog has no registration, so it is gone now.
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Add dog registration' })).toBeNull()
      );
      await waitFor(() => {
        const focused = document.activeElement as HTMLElement;
        expect(focused.getAttribute('role')).toBe('tab');
        expect(focused.getAttribute('aria-selected')).toBe('true');
      });
    });
  }
);
