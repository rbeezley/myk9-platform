import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AddRegistrationPanel from './AddRegistrationPanel';

/**
 * MYK9-518 hosts this panel for the life of the Dog Details page, so it no
 * longer unmounts between uses. EditPanelWrapper resets only when initialData
 * changes by VALUE, and this panel's is a module constant — so without an
 * explicit reset on the open edge it reopens holding the registration just
 * saved, with Save enabled by `forceHasChanges`: a duplicate-row invitation.
 */
describe('AddRegistrationPanel reopen', () => {
  it('starts blank again when reopened without unmounting', async () => {
    const { rerender, user } = render(
      <AddRegistrationPanel open={false} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );

    rerender(
      <AddRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );
    const number = await screen.findByLabelText(/registration number/i);
    await user.type(number, 'SR999');
    expect(number).toHaveValue('SR999');

    // Close and reopen the SAME mounted instance.
    rerender(
      <AddRegistrationPanel open={false} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );
    rerender(
      <AddRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );

    expect(await screen.findByLabelText(/registration number/i)).toHaveValue('');
  });
});
