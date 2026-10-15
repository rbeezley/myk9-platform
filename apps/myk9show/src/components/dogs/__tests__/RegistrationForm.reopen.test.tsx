/**
 * MYK9-1210 — the in-memory registration form is seeded when it mounts, and a
 * host that opens it for another row remounts it with a `key` (as AddDogPanel
 * does) instead of the form rewriting itself during render.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { RegistrationFormInline } from '@/components/panels/edit/AddDogPanel/RegistrationFormInline';
import type { Registration } from '@/types/dog-types';

const rowA: Registration = {
  id: 'reg-a',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Ch Alpha',
  breed: 'Beagle',
  registrationNumber: 'AAA111',
  status: 'Active',
};
const rowB: Registration = {
  ...rowA,
  id: 'reg-b',
  registeredName: 'Ch Bravo',
  registrationNumber: 'BBB222',
};

function Host({ row }: { row: Registration }) {
  return (
    <RegistrationFormInline key={row.id} initialData={row} onSave={vi.fn()} onDone={vi.fn()} />
  );
}

describe('registration form reopen', () => {
  it('shows the fresh row’s values, not the previous row’s or its unsaved edits', async () => {
    const { user, rerender } = render(<Host row={rowA} />);
    const name = screen.getByRole('textbox', { name: /Registered Name/ });
    expect(name).toHaveValue('Ch Alpha');
    await user.clear(name);
    await user.type(name, 'X');

    rerender(<Host row={rowB} />);

    expect(screen.getByRole('textbox', { name: /Registered Name/ })).toHaveValue('Ch Bravo');
    expect(screen.getByRole('textbox', { name: /Registration Number/ })).toHaveValue('BBB222');
  });

  it('drops an abandoned edit when the same row is opened again', async () => {
    const first = render(<Host row={rowA} />);
    const name = screen.getByRole('textbox', { name: /Registered Name/ });
    await first.user.clear(name);
    await first.user.type(name, 'X');
    first.unmount();

    render(<Host row={rowA} />);
    expect(screen.getByRole('textbox', { name: /Registered Name/ })).toHaveValue('Ch Alpha');
  });
});
