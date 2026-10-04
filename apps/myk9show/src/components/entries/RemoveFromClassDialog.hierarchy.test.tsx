/**
 * MYK9-988: the leave-class dialog's copy per branch, and which button is the
 * quiet way out versus the destructive confirm.
 */
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/test/utils/testUtils';
import { RemoveFromClassDialog } from './RemoveFromClassDialog';
import type { ShowRegistryResolution } from './useShowRegistryId';

function renderDialog(registry: ShowRegistryResolution) {
  render(
    <RemoveFromClassDialog
      open
      classId="class-1"
      className="Container Novice A"
      classWhen="Sat, Nov 14"
      registry={registry}
      isSaving={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
  return screen.findByRole('alertdialog');
}

describe('RemoveFromClassDialog — copy and button hierarchy (MYK9-988)', () => {
  it('chooser: one short sentence per act, and "Keep my entry" is not filled', async () => {
    const dialog = within(await renderDialog({ status: 'resolved', registry: 'AKC' }));

    expect(
      dialog.getByText(/Pick one — the club handles the fee differently for each/)
    ).toBeVisible();
    expect(dialog.queryByText(/withdrawing and pulling are different/i)).not.toBeInTheDocument();
    expect(
      dialog.getByText(
        "Dog in season or Judge change only. Refund per the premium's rules; the show secretary confirms it."
      )
    ).toBeVisible();
    expect(
      dialog.getByText("Any other reason. Refunds for a pull are at the club's discretion.")
    ).toBeVisible();

    const keep = dialog.getByRole('button', { name: 'Keep my entry' });
    expect(keep).not.toHaveClass('bg-primary');
    expect(keep).not.toHaveClass('bg-secondary');
    expect(keep).toHaveClass('bg-transparent');
    // Withdraw and Pull are the bold, full-width choices.
    expect(dialog.getByRole('button', { name: 'Withdraw' })).toHaveClass('font-semibold');
    expect(dialog.getByRole('button', { name: 'Pull' })).toHaveClass('font-semibold');
  });

  it('chooser: Withdraw lists only the reasons the registry has (ASCA)', async () => {
    const dialog = within(await renderDialog({ status: 'resolved', registry: 'ASCA' }));
    expect(
      dialog.getByText(
        "Judge change only. Refund per the premium's rules; the show secretary confirms it."
      )
    ).toBeVisible();
  });

  it('chooser: while the rulebook is unknown Withdraw promises nothing', async () => {
    const dialog = within(await renderDialog({ status: 'resolving' }));
    expect(dialog.getByText('Only for a reason this show’s registry recognises.')).toBeVisible();
    expect(dialog.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
  });

  it('pull confirm: refund is the club’s call, and Pull entry is the destructive action', async () => {
    const user = userEvent.setup();
    const dialog = within(await renderDialog({ status: 'resolved', registry: 'AKC' }));
    await user.click(dialog.getByRole('button', { name: 'Pull' }));

    expect(
      dialog.getByText("Refunds for a pull are at the club's discretion.", { exact: false })
    ).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Pull entry' });
    expect(confirm).toHaveClass('bg-destructive');
    const keep = dialog.getByRole('button', { name: 'Keep my entry' });
    expect(keep).not.toHaveClass('bg-destructive');
    expect(keep).not.toHaveClass('bg-primary');
  });

  it('withdraw confirm: refund per the premium, and Withdraw entry is destructive', async () => {
    const user = userEvent.setup();
    const dialog = within(await renderDialog({ status: 'resolved', registry: 'AKC' }));
    await user.click(dialog.getByRole('button', { name: 'Withdraw' }));
    await user.click(dialog.getByRole('button', { name: 'Dog in season' }));

    expect(
      dialog.getByText(/The show secretary confirms the refund under the premium's rules/)
    ).toBeVisible();
    expect(dialog.getByRole('button', { name: 'Withdraw entry' })).toHaveClass('bg-destructive');
    expect(dialog.getByRole('button', { name: 'Keep my entry' })).not.toHaveClass('bg-destructive');
  });
});
