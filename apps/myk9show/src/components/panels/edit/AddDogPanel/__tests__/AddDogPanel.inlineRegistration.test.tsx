/**
 * MYK9-1081 (T2): inline, Add Dog hosts its registration form as a sub-mode of
 * itself rather than raising a second slide-out over its host. The other
 * variants keep today's registration slide-out and photo control.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

describe('AddDogPanel inline registration sub-mode (T2)', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('renders the registration form in place, with no overlay of its own', async () => {
    const onSubModeChange = vi.fn();
    const { user } = renderInline(onSubModeChange);
    await addFirstRegistration(user);
    await fillDogBasics(user);
    await user.click(screen.getByRole('tab', { name: /Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));

    expect(await screen.findByLabelText(/Registered Name/i)).toBeInTheDocument();
    expect(dialogs()).toHaveLength(0);
    expect(onSubModeChange).toHaveBeenLastCalledWith('registration-add');

    await fillRegistration(user, 'DN22222201');
    await waitFor(() => expect(onSubModeChange).toHaveBeenLastCalledWith('dog'));
    expect(screen.getByRole('button', { name: /Edit AKC.*DN22222201/ })).toBeVisible();
    expect(dialogs()).toHaveLength(0);
  });

  it('saves the registration with the dog', async () => {
    const { user } = renderInline();
    await addFirstRegistration(user);
    await fillDogBasics(user);
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
    const { user } = renderInline();
    await user.click(await screen.findByRole('button', { name: /No registration number yet/ }));
    expect(await screen.findByLabelText(/Call Name/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dog photo/i })).toBeNull();
  });

  it('keeps the photo control in the panel variant', async () => {
    const { user } = render(
      <AddDogPanel
        open
        onClose={vi.fn()}
        onDogCreated={vi.fn()}
        userRole={UserRole.SECRETARY}
        currentUserPersonId="person-1"
      />
    );
    await user.click(await screen.findByRole('button', { name: /No registration number yet/ }));
    expect(await screen.findByRole('button', { name: 'Add dog photo' })).toBeInTheDocument();
  });

  // MYK9-1210: the form is seeded once, when it mounts, so opening another row
  // while one is open must remount it. The dog form is inert in a sub-mode, so
  // a click cannot reach the second row's Edit; fireEvent drives the same
  // `onOpenRegistration` path the page-level opener would.
  it('shows the second row’s values when it is opened while the first is open', async () => {
    const { user } = renderInline();
    await addFirstRegistration(user, 'DN12345601');
    await fillDogBasics(user);
    await user.click(screen.getByRole('tab', { name: /Registration/ }));
    await user.click(await screen.findByRole('button', { name: /Add New Registration/ }));
    await fillRegistration(user, 'DN22222201');
    await screen.findByRole('button', { name: /Edit AKC.*DN22222201/ });

    await user.click(await screen.findByRole('button', { name: /Edit AKC.*DN12345601/ }));
    expect(await screen.findByLabelText(/Registration Number/i)).toHaveValue('DN12345601');

    fireEvent.click(screen.getByRole('button', { name: /Edit AKC.*DN22222201/, hidden: true }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Registration Number/i)).toHaveValue('DN22222201')
    );
  });
});
