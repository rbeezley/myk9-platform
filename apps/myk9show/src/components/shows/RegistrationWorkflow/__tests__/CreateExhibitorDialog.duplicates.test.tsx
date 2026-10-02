/**
 * MYK9-931 review fixes for the entry-flow Add Person: a prefilled name is
 * saveable without edits, and the possible-duplicate prompt is announced and in
 * view, re-checks when the identity changes, and runs when leaving Basic Info
 * (Next) as well as at the final save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { createUser } from '@/services/database/users';
import { useUserStore } from '@/store/userStore';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: vi.fn(),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: { createPerson: vi.fn(), getPendingMutationIdsForRow: vi.fn() },
}));

const createUserMock = vi.mocked(createUser);

const existing = {
  id: 'person-existing-1',
  firstName: 'Tera',
  lastName: 'Handler',
  email: 'tera@example.com',
  phone: '555-1212',
  dogs: [],
};

const next = () => screen.findByRole('button', { name: /Next: Contact/ });

describe('CreateExhibitorDialog prefill and duplicate prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ people: [existing], users: [existing] } as never);
  });

  it('a prefilled name is saveable without any edit', async () => {
    createUserMock.mockResolvedValue(
      fromAny({
        data: { id: 'p9', first_name: 'Jane', last_name: 'Doe', email: null, phone: null },
        error: null,
      })
    );
    const user = userEvent.setup();
    render(
      <CreateExhibitorDialog
        open
        onOpenChange={vi.fn()}
        onExhibitorCreated={vi.fn()}
        searchQuery="Jane Doe"
      />
    );
    await user.click(await next());
    const add = await screen.findByRole('button', { name: 'Add Person' });
    expect(add).toBeEnabled();
    await user.click(add);
    await waitFor(() =>
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ first_name: 'Jane', last_name: 'Doe' })
      )
    );
  });

  it('checks for a duplicate when leaving Basic Info, and announces and focuses the prompt', async () => {
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText(/First Name/), 'Tera');
    await user.type(screen.getByLabelText(/Last Name/), 'Handler');
    await user.type(screen.getByLabelText(/Email Address/), 'tera@example.com');
    await user.click(await next());

    const notice = await screen.findByTestId('person-duplicate-notice');
    expect(notice).toHaveAttribute('role', 'alert');
    await waitFor(() => expect(document.activeElement).toBe(notice));
    // Still on Basic Info: the secretary learns before filling Contact.
    expect(screen.getByRole('tab', { name: /Basic Info/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('clears the prompt when the name or email changes, and re-checks on the next Next', async () => {
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText(/First Name/), 'Tera');
    await user.type(screen.getByLabelText(/Last Name/), 'Handler');
    await user.type(screen.getByLabelText(/Email Address/), 'tera@example.com');
    await user.click(await next());
    await screen.findByTestId('person-duplicate-notice');

    await user.type(screen.getByLabelText(/Email Address/), 'x');
    await waitFor(() =>
      expect(screen.queryByTestId('person-duplicate-notice')).not.toBeInTheDocument()
    );

    // "Add anyway" answers for one identity only: change it and the check runs again.
    await user.clear(screen.getByLabelText(/Email Address/));
    await user.type(screen.getByLabelText(/Email Address/), 'tera@example.com');
    await user.click(await next());
    await user.click(await screen.findByRole('button', { name: 'Add Person Anyway' }));
    await user.click(await next());
    expect(screen.getByRole('tab', { name: /Contact/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: /Basic Info/ }));
    await user.type(screen.getByLabelText(/Last Name/), 's');
    await user.click(await next());
    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
  });

  it('still checks at the final save', async () => {
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText(/First Name/), 'Tera');
    await user.type(screen.getByLabelText(/Last Name/), 'Handler');
    await user.click(await next());
    // Name alone is not a likely duplicate; name plus phone is.
    expect(screen.queryByTestId('person-duplicate-notice')).not.toBeInTheDocument();
    await user.type(await screen.findByLabelText(/Phone Number/), '555-1212');
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(createUserMock).not.toHaveBeenCalled();
  });
});
