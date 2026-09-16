/**
 * Interaction coverage for the status dialog itself — it had none, which is how
 * a restructure that moved each option's description OUT of its `<Label>` (to
 * stop the shared Label primitive uppercasing it) silently shrank every click
 * target from the two-line block to the one-word name.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import DogStatusDialog from '../DogStatusDialog';

function renderDialog(onSave = vi.fn()) {
  render(
    <DogStatusDialog
      open
      onOpenChange={() => {}}
      dogName="Juni"
      currentStatus="active"
      onSave={onSave}
    />
  );
  return onSave;
}

/**
 * The radio that BELONGS to an option, resolved through the label's `htmlFor`
 * rather than by position — an index would quietly re-point every assertion if
 * the options were ever reordered.
 */
function radioFor(name: string): HTMLElement {
  const label = screen.getByText(name).closest('label');
  if (!label) throw new Error(`no label around option "${name}"`);
  const input = document.getElementById(label.htmlFor);
  if (!input) throw new Error(`no control for "${name}" (htmlFor=${label.htmlFor})`);
  // Base UI puts `id` on the hidden input and `role="radio"` on a sibling span.
  const radio =
    input.closest('[role="radio"]') ?? input.parentElement?.querySelector('[role="radio"]');
  return (radio ?? input) as HTMLElement;
}

describe('DogStatusDialog', () => {
  // The description sits INSIDE the option's <label> so the whole two-line block
  // stays one click target — which also means it inherits the shared Label's
  // `uppercase`, and `normal-case` is the only thing preventing "PRESERVES
  // JUNI'S RECORDS AND COMPETITION HISTORY" at someone marking their dog dead.
  // Asserted as a class because jsdom does not apply Tailwind, so a computed
  // `textTransform` check would pass no matter what.
  it.each([['Active'], ['Retired'], ['Deceased']])(
    'keeps the %s option out of the shared label uppercase',
    name => {
      renderDialog();
      const label = screen.getByText(name).closest('label');
      const classes = (label?.className ?? '').split(/\s+/);
      expect(classes).toContain('normal-case');
      expect(classes).not.toContain('uppercase');
    }
  );

  // `display:block` is what makes the accessible name read "Active Currently
  // showing…" rather than one run-together token: accname inserts a space
  // between block-level descendants. jsdom cannot compute it from a Tailwind
  // class, so the class itself is the honest thing to pin.
  it.each([['Active'], ['Retired'], ['Deceased']])(
    'keeps the %s name and description as separate block spans',
    name => {
      renderDialog();
      const nameSpan = screen.getByText(name);
      expect(nameSpan.tagName).toBe('SPAN');
      expect(nameSpan.className.split(/\s+/)).toContain('block');
    }
  );
  it.each([
    ['Retired', 'No longer showing but records are preserved'],
    ['Deceased', "Preserves Juni's records and competition history"],
  ])('selects %s when its description line is clicked', (name, description) => {
    renderDialog();
    fireEvent.click(screen.getByText(description));
    expect(radioFor(name)).toHaveAttribute('aria-checked', 'true');
    expect(radioFor('Active')).toHaveAttribute('aria-checked', 'false');
  });

  it('selects an option when its name is clicked', () => {
    renderDialog();
    fireEvent.click(screen.getByText('Retired'));
    expect(radioFor('Retired')).toHaveAttribute('aria-checked', 'true');
  });

  // The description belongs to the option, so it has to reach assistive tech as
  // part of the radio's name — moving it out of the label dropped it entirely.
  // Asserted as substrings, not an exact string: the accessible name's word
  // separation depends on computed `display`, which jsdom does not derive from a
  // Tailwind class, so exact spacing here would assert jsdom's behaviour rather
  // than ours. What matters is that BOTH halves still reach assistive tech --
  // moving the description out of the label dropped it from the name entirely.
  it('keeps each option description in the radio accessible name', () => {
    renderDialog();
    expect(radioFor('Active')).toHaveAccessibleName(/^Active/);
    expect(radioFor('Active')).toHaveAccessibleName(/Currently showing and eligible for entries$/);
  });

  it('asks for a date of passing only for Deceased, and saves it', () => {
    const onSave = renderDialog();
    expect(screen.queryByLabelText(/date of passing/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Deceased'));
    const date = screen.getByLabelText(/date of passing/i);
    fireEvent.change(date, { target: { value: '2026-03-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('deceased', '2026-03-03');
  });

  it('drops any entered date when the status is not Deceased', () => {
    const onSave = renderDialog();
    fireEvent.click(screen.getByText('Deceased'));
    fireEvent.change(screen.getByLabelText(/date of passing/i), {
      target: { value: '2026-03-03' },
    });
    fireEvent.click(screen.getByText('Retired'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('retired', undefined);
  });
});
