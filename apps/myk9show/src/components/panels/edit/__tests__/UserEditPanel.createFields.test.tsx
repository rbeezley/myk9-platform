/**
 * MYK9-931 (Codex P1): create mode must show exactly the fields the create paths
 * persist (createUser, replicated createPerson, BrowsePeoplePage.handleCreateUser:
 * name, email, phone, street, city, state, ZIP). Photo, junior handler, bio and
 * emergency contact are edited after creation, so create hides them. Even an
 * admin with advanced-field permission sees none of them while adding.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { UserEditPanel } from '../UserEditPanel';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));

const PERSISTED = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zipCode',
];

function shownFieldIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('input, textarea, select, [role="combobox"]')
  )
    .filter(el => el.getAttribute('type') !== 'hidden')
    .map(el => el.id)
    .filter(Boolean)
    .sort();
}

describe('UserEditPanel create mode shows only persisted fields', () => {
  it('shows exactly the persisted set across Basic Info and Contact, even for an admin', async () => {
    const user = userEvent.setup();
    render(
      <UserEditPanel
        open
        onClose={() => {}}
        userId=""
        userName="New"
        initialUserData={{}}
        onSave={vi.fn()}
      />
    );
    await screen.findByLabelText(/First Name/);
    const basic = shownFieldIds();
    await user.click(screen.getByRole('tab', { name: /^Contact/ }));
    await screen.findByLabelText(/Phone Number/);
    const all = Array.from(new Set([...basic, ...shownFieldIds()])).sort();
    expect(all).toEqual([...PERSISTED].sort());
    expect(screen.queryByRole('button', { name: /change photo/i })).not.toBeInTheDocument();
  });

  it('edit mode still offers photo, junior handler and bio', async () => {
    render(
      <UserEditPanel
        open
        onClose={() => {}}
        userId="p1"
        userName="Ada"
        initialUserData={{ id: 'p1', firstName: 'Ada', lastName: 'L', email: 'a@b.co' }}
        onSave={vi.fn()}
      />
    );
    expect(await screen.findByRole('button', { name: /change photo/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
    expect(screen.getByLabelText(/Date of birth/i)).toBeInTheDocument();
  });
});
