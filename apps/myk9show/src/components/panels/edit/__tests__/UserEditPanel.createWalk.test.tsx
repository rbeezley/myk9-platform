/**
 * MYK9-931: the one Person form. Email is optional (a mail-in entrant has none),
 * create mode walks Basic Info -> Contact with Next and offers "Add Person" only
 * on the last tab, and an error on a hidden tab switches to that tab.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { UserEditPanel } from '../UserEditPanel';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));

const tab = (name: RegExp) => screen.getByRole('tab', { name });

function renderCreate(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <UserEditPanel
      open
      onClose={() => {}}
      userId=""
      userName="New Person"
      initialUserData={{}}
      onSave={onSave}
    />
  );
  return onSave;
}

describe('UserEditPanel create mode', () => {
  it('saves a mail-in Add Person with no email', async () => {
    const user = userEvent.setup();
    const onSave = renderCreate();
    await user.type(await screen.findByLabelText(/First Name/), 'Pat');
    await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      firstName: 'Pat',
      lastName: 'Paperform',
      email: '',
    });
  });

  it('marks Email Address optional, not required', async () => {
    renderCreate();
    const email = await screen.findByLabelText(/Email Address/);
    expect(email.closest('.form-field')).not.toHaveTextContent('(required)');
    expect(email.closest('.form-field')).toHaveTextContent('(optional)');
  });

  it('still rejects a malformed email', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(await screen.findByLabelText(/First Name/), 'Pat');
    await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
    await user.type(screen.getByLabelText(/Email Address/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toHaveTextContent(
      'valid email address'
    );
    expect(tab(/^Basic Info/)).toHaveAttribute('aria-selected', 'true');
  });

  it('walks Basic Info then Contact: Next first, Add Person only on the last tab', async () => {
    const user = userEvent.setup();
    renderCreate();
    expect(await screen.findByRole('button', { name: /Next: Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Person' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toHaveTextContent(
      'Please enter a first name'
    );

    await user.type(screen.getByLabelText(/First Name/), 'Pat');
    await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /Next:/ })).not.toBeInTheDocument();
    // Earlier tabs stay clickable.
    await user.click(tab(/^Basic Info/));
    expect(screen.getByRole('button', { name: /Next: Contact/ })).toBeInTheDocument();
  });
});

describe('UserEditPanel hidden-tab errors', () => {
  it('switches to Contact and focuses the first invalid field on Save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UserEditPanel
        open
        onClose={() => {}}
        userId="person-1"
        userName="Ada Lovelace"
        initialUserData={{
          id: 'person-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          address: '1 Main St',
          city: '',
          state: 'NE',
        }}
        onSave={onSave}
      />
    );
    await user.type(await screen.findByLabelText(/First Name/), 'x');
    expect(screen.getAllByRole('button', { name: 'Save Changes' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'city'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
