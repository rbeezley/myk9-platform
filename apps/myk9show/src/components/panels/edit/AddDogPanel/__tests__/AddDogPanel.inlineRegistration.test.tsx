/**
 * MYK9-1081 (T2): inline, Add Dog hosts its registration form as a sub-mode of
 * itself rather than raising a second slide-out over its host. The other
 * variants keep today's registration slide-out and photo control.
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
import { dialogs, fillDogBasics, fillRegistration } from '@/test/quickCreate/quickCreateFlowKit';

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

function renderInline(onSubModeChange = vi.fn()) {
  return render(
    <AddDogPanel
      open
      onClose={vi.fn()}
      onDogCreated={vi.fn()}
      userRole={UserRole.SECRETARY}
      currentUserPersonId="person-1"
      variant="inline"
      onSubModeChange={onSubModeChange}
    />
  );
}

describe('AddDogPanel inline registration sub-mode (T2)', () => {
  it('renders the registration form in place, with no overlay of its own', async () => {
    const onSubModeChange = vi.fn();
    const { user } = renderInline(onSubModeChange);
    await fillDogBasics(user);
    await user.click(screen.getByRole('tab', { name: /Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(dialogs()).toHaveLength(0);
    expect(onSubModeChange).toHaveBeenLastCalledWith('registration-add');

    await fillRegistration(user);
    await waitFor(() => expect(onSubModeChange).toHaveBeenLastCalledWith('dog'));
    expect(screen.getByText('Mailbox Special Delivery')).toBeVisible();
    expect(dialogs()).toHaveLength(0);
  });

  it('saves the registration with the dog', async () => {
    const { user } = renderInline();
    await fillDogBasics(user);
    await user.click(screen.getByRole('button', { name: /Next: Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));
    await fillRegistration(user);
    await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Dog' }));

    await waitFor(() =>
      expect(mocks.addDog).toHaveBeenCalledWith(
        expect.objectContaining({
          registrations: [
            {
              organization: 'AKC (American Kennel Club)',
              number: 'DN12345601',
              registeredName: 'Mailbox Special Delivery',
              type: 'Golden Retriever',
              status: 'Active',
            },
          ],
        }),
        {}
      )
    );
  });

  it('hides the photo control inline and keeps it for the panel variant (D4)', async () => {
    renderInline();
    expect(await screen.findByLabelText(/Call Name/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dog photo/i })).toBeNull();
  });

  it('keeps the photo control in the panel variant', async () => {
    render(
      <AddDogPanel
        open
        onClose={vi.fn()}
        onDogCreated={vi.fn()}
        userRole={UserRole.SECRETARY}
        currentUserPersonId="person-1"
      />
    );
    expect(await screen.findByRole('button', { name: 'Add dog photo' })).toBeInTheDocument();
  });
});
