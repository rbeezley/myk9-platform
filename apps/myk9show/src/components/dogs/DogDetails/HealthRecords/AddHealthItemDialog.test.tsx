import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import AddHealthItemDialog from './AddHealthItemDialog';

/** Opens the genetic-screening test-date picker and selects today. */
async function pickGeneticTestDate(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getByRole('button', { name: /select date/i }));
  await user.click(screen.getByRole('button', { name: /^today,/i }));
}

describe('AddHealthItemDialog', () => {
  it('does not call onAdd when the required vaccine name is empty, and keeps the form open', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <AddHealthItemDialog open type="vaccination" dogId="dog-1" onClose={vi.fn()} onAdd={onAdd} />
    );

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Native constraint validation (via requestSubmit) blocks the empty
    // required field before any submit event -- and therefore any
    // mutation call -- can occur.
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/vaccine name/i)).toBeInvalid();
    expect(screen.getByLabelText(/vaccine name/i)).toBeInTheDocument();
  });

  it('does not call onAdd for an allergy without the required allergen', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <AddHealthItemDialog open type="allergy" dogId="dog-1" onClose={vi.fn()} onAdd={onAdd} />
    );

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/allergen/i)).toBeInvalid();
  });

  it('does not call onAdd for a vet visit missing the required visit date', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <AddHealthItemDialog open type="vet_visit" dogId="dog-1" onClose={vi.fn()} onAdd={onAdd} />
    );

    // Reason is a native required input; fill it so the date (rendered via
    // the non-native DatePickerField/hidden-input picker) is the only gap,
    // exercising the explicit TypeScript validation from design.md
    // Decision 3 rather than native constraint validation.
    await user.type(screen.getByLabelText(/^reason\b/i), 'Annual checkup');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/visit date is required/i);
    expect(screen.getByLabelText(/^reason\b/i)).toHaveValue('Annual checkup');
  });

  it('keeps the dialog open and preserves entered values when the create mutation fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Network error'));

    const { user } = render(
      <AddHealthItemDialog open type="allergy" dogId="dog-1" onClose={vi.fn()} onAdd={onAdd} />
    );

    await user.type(screen.getByLabelText(/allergen/i), 'Chicken');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    // The dialog stays open (the parent never flips `open` to false on
    // failure) and the entered value is preserved for retry.
    expect(screen.getByLabelText(/allergen/i)).toHaveValue('Chicken');
  });

  it('blocks the header × (and every close path) while a submission is in flight', async () => {
    // Regression test for the stale-dialog-close defect: previously the
    // header × stayed active during a pending mutation, so a user could
    // close mid-submit and reopen a fresh dialog before the first request
    // settled; the stale request's `.then()` would then reset/close the
    // *new* instance out from under the user. Blocking every close path
    // while submitting removes the "close, then reopen" precondition
    // entirely.
    let resolveFirstAdd: (() => void) | undefined;
    const onAdd = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveFirstAdd = resolve;
        })
    );
    const onClose = vi.fn();

    const { user } = render(
      <AddHealthItemDialog open type="allergy" dogId="dog-1" onClose={onClose} onAdd={onAdd} />
    );

    await user.type(screen.getByLabelText(/allergen/i), 'Chicken');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    // Header × is a no-op while the mutation is pending.
    await user.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).not.toHaveBeenCalled();
    // The value the user entered is still there; nothing was reset.
    expect(screen.getByLabelText(/allergen/i)).toHaveValue('Chicken');

    // Once the (only) in-flight request resolves, the dialog is free to
    // close normally -- and does, because it succeeded.
    resolveFirstAdd?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not call onAdd for a genetic screening with a marker-only row', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <AddHealthItemDialog
        open
        type="genetic_screening"
        dogId="dog-1"
        onClose={vi.fn()}
        onAdd={onAdd}
      />
    );

    await user.type(screen.getByLabelText(/provider/i), 'Embark');
    await pickGeneticTestDate(user);
    await user.type(screen.getByPlaceholderText(/marker \(e\.g\., dm\)/i), 'DM');
    // Result intentionally left blank.
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /each marker row needs both a marker and a result/i
    );
    // Nothing was reset: the half-filled row is still there for the
    // exhibitor to complete or clear.
    expect(screen.getByPlaceholderText(/marker \(e\.g\., dm\)/i)).toHaveValue('DM');
  });

  it('does not call onAdd for a genetic screening with a result-only row', async () => {
    const onAdd = vi.fn();

    const { user } = render(
      <AddHealthItemDialog
        open
        type="genetic_screening"
        dogId="dog-1"
        onClose={vi.fn()}
        onAdd={onAdd}
      />
    );

    await user.type(screen.getByLabelText(/provider/i), 'Embark');
    await pickGeneticTestDate(user);
    // Marker intentionally left blank; only the result is filled.
    await user.type(screen.getByPlaceholderText(/^result$/i), 'Clear');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /each marker row needs both a marker and a result/i
    );
  });

  it('closes and resets only after the create mutation succeeds', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const { user } = render(
      <AddHealthItemDialog open type="allergy" dogId="dog-1" onClose={onClose} onAdd={onAdd} />
    );

    await user.type(screen.getByLabelText(/allergen/i), 'Beef');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
