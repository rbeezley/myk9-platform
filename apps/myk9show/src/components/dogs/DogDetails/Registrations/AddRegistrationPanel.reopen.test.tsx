import { describe, expect, it, vi } from 'vitest';
import { screen, waitForElementToBeRemoved } from '@testing-library/react';
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
  it('starts blank again when reopened after the panel subtree has unmounted', async () => {
    const { rerender, user } = render(
      <AddRegistrationPanel open={false} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );

    rerender(
      <AddRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );
    const number = await screen.findByLabelText(/registration number/i);
    await user.type(number, 'SR999');
    expect(number).toHaveValue('SR999');

    // Close, and WAIT for the fields to actually leave the DOM. SlideOverPanel
    // returns null once `!open && !isAnimating` (~300ms), so the real flow
    // remounts this subtree while EditPanelWrapper's form state survives above
    // it. Reopening synchronously stays inside the animation window, where the
    // subtree is still mounted — a test that does that cannot fail on the path
    // this guard exists for.
    rerender(
      <AddRegistrationPanel open={false} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );
    await waitForElementToBeRemoved(() => screen.queryByLabelText(/registration number/i));

    rerender(
      <AddRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );

    expect(await screen.findByLabelText(/registration number/i)).toHaveValue('');
  });
});
