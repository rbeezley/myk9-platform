import { describe, expect, it, vi } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import PedigreeAncestorAddDialog from './PedigreeAncestorAddDialog';
import PedigreeAncestorEditDialog from './PedigreeAncestorEditDialog';
import type { PedigreeAncestor } from '@/types/pedigree-types';

const ancestor: PedigreeAncestor = {
  id: 'ancestor-1',
  dog_id: 'dog-1',
  owner_id: 'owner-1',
  position: 'sire',
  linked_dog_id: null,
  registered_name: 'Old Name',
  call_name: null,
  titles: null,
  breed: null,
  color: null,
  sex: 'male',
  date_of_birth: null,
  photo_url: null,
  registration_numbers: {},
  health_info: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('PedigreeAncestorAddDialog', () => {
  it('does not call onAdd when the required dog name is empty, and keeps the form open', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <PedigreeAncestorAddDialog
        open
        position="sire"
        dogId="dog-1"
        ownerId="owner-1"
        onClose={vi.fn()}
        onAdd={onAdd}
      />
    );

    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onAdd).not.toHaveBeenCalled();
    // Native constraint validation (via requestSubmit) blocks the empty
    // required field and identifies it as invalid without ever dispatching
    // a submit event.
    expect(screen.getByRole('textbox', { name: /registered name/i })).toBeInvalid();
    // The form is still open and available for correction.
    expect(screen.getByRole('textbox', { name: /registered name/i })).toBeInTheDocument();
  });

  it('keeps the dialog open and preserves entered values when the create mutation fails', async () => {
    const onAdd = vi.fn();

    const { user, rerender } = render(
      <PedigreeAncestorAddDialog
        open
        position="sire"
        dogId="dog-1"
        ownerId="owner-1"
        onClose={vi.fn()}
        onAdd={onAdd}
        saveError={null}
      />
    );

    const nameInput = screen.getByRole('textbox', { name: /registered name/i });
    await user.type(nameInput, 'New Sire');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);

    // Simulate the parent mutation rejecting: it surfaces `saveError` and
    // never toggles `open` to false, so the dialog stays open.
    rerender(
      <PedigreeAncestorAddDialog
        open
        position="sire"
        dogId="dog-1"
        ownerId="owner-1"
        onClose={vi.fn()}
        onAdd={onAdd}
        saveError="Network error"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
    expect(screen.getByRole('textbox', { name: /registered name/i })).toHaveValue('New Sire');
  });
});

describe('PedigreeAncestorEditDialog', () => {
  it('does not call onSave when the required dog name is cleared, and keeps the form open', async () => {
    const onSave = vi.fn();

    const { user } = render(
      <PedigreeAncestorEditDialog open ancestor={ancestor} onClose={vi.fn()} onSave={onSave} />
    );

    const nameInput = screen.getByRole('textbox', { name: /registered name/i });
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(nameInput).toBeInvalid();
  });

  it('keeps the dialog open and preserves entered values when the update mutation fails', async () => {
    const onSave = vi.fn();

    const { user, rerender } = render(
      <PedigreeAncestorEditDialog open ancestor={ancestor} onClose={vi.fn()} onSave={onSave} />
    );

    const nameInput = screen.getByRole('textbox', { name: /registered name/i });
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(
      <PedigreeAncestorEditDialog
        open
        ancestor={ancestor}
        onClose={vi.fn()}
        onSave={onSave}
        saveError="Server rejected the update"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/server rejected the update/i);
    expect(screen.getByRole('textbox', { name: /registered name/i })).toHaveValue('Updated Name');
  });
});
