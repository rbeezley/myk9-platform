/**
 * MYK9-931 (Codex round 3): callers keep an Add panel mounted while closed, so a
 * panel closed on its last tab reopened on that tab ("Add Person") instead of
 * the first ("Next: Contact"). Every steps panel reopens on its first tab.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { UserEditPanel } from '../UserEditPanel';
import { ClubEditPanel } from '../ClubEditPanel';
import { AddDogPanel } from '../AddDogPanel';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog: vi.fn(),
    addDogOfflineFirst: vi.fn(),
    dogs: [],
    isLoading: false,
    error: null,
  }),
}));

describe('steps panels reopen on their first tab', () => {
  it('Add Person', async () => {
    const user = userEvent.setup();
    const props = {
      onClose: () => {},
      userId: '',
      userName: 'New',
      initialUserData: {},
      onSave: vi.fn(),
    };
    const { rerender } = render(<UserEditPanel open {...props} />);
    await user.type(await screen.findByLabelText(/First Name/), 'Pat');
    await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
    await user.click(await screen.findByRole('tab', { name: /^Contact/ }));
    expect(await screen.findByRole('button', { name: 'Add Person' })).toBeInTheDocument();

    rerender(<UserEditPanel open={false} {...props} />);
    rerender(<UserEditPanel open {...props} />);

    expect(await screen.findByRole('button', { name: /Next: Contact/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Basic Info/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Add Person' })).not.toBeInTheDocument();
  });

  it('a stale "Next is blocked" message does not survive a reopen', async () => {
    const user = userEvent.setup();
    const props = {
      onClose: () => {},
      userId: '',
      userName: 'New',
      initialUserData: {},
      onSave: vi.fn(),
    };
    const { rerender } = render(<UserEditPanel open {...props} />);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();

    rerender(<UserEditPanel open={false} {...props} />);
    rerender(<UserEditPanel open {...props} />);
    await screen.findByRole('button', { name: /Next: Contact/ });
    expect(screen.queryByTestId('edit-panel-step-blocked')).not.toBeInTheDocument();
  });

  it('Add Club', async () => {
    const user = userEvent.setup();
    const props = {
      onClose: () => {},
      clubId: '',
      clubName: '',
      initialClubData: {},
      mode: 'create' as const,
    };
    const { rerender } = render(<ClubEditPanel open {...props} />);
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    await user.type(await screen.findByRole('textbox', { name: /Email Address/ }), 'c@example.com');
    await user.type(screen.getByRole('textbox', { name: /Phone Number/ }), '555-123-4567');
    await user.type(screen.getByRole('textbox', { name: /Street Address/ }), '1 Main St');
    await user.type(screen.getByRole('textbox', { name: /City/ }), 'Omaha');
    await user.type(screen.getByRole('textbox', { name: /State/ }), 'NE');
    await user.type(screen.getByRole('textbox', { name: /ZIP Code/ }), '68102');
    await user.click(screen.getByRole('button', { name: /Next: Premium/ }));
    expect(await screen.findByRole('button', { name: 'Add Club' })).toBeInTheDocument();

    rerender(<ClubEditPanel open={false} {...props} />);
    rerender(<ClubEditPanel open {...props} />);

    expect(await screen.findByRole('button', { name: /Next: Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Club' })).not.toBeInTheDocument();
  });

  it('Add Dog', async () => {
    const user = userEvent.setup();
    const props = { onClose: () => {}, onDogCreated: vi.fn() };
    const { rerender } = render(<AddDogPanel open {...props} currentUserPersonId="p1" />);
    await user.type(await screen.findByLabelText(/Call Name/i), 'Rex');
    await user.click(screen.getByRole('combobox', { name: /^Sex/ }));
    await user.click(await screen.findByRole('option', { name: /^Male/ }));
    await user.type(screen.getByLabelText(/Date of Birth/), '2020-06-15');
    await user.click(await screen.findByRole('tab', { name: /optional details/i }));
    expect(await screen.findByRole('button', { name: 'Add Dog' })).toBeInTheDocument();

    rerender(<AddDogPanel open={false} {...props} currentUserPersonId="p1" />);
    rerender(<AddDogPanel open {...props} currentUserPersonId="p1" />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Next: Registration/ })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Add Dog' })).not.toBeInTheDocument();
  });
});
