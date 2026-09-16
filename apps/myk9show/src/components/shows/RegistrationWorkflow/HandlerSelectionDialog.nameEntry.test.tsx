import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandlerSelectionDialog } from './HandlerSelectionDialog';
import type { Dog } from '@/types/dog-types';
import type { HandlerInfo } from '@/types/show-registration-types';

/**
 * MYK9-567: the handler-name field would not accept a space — a tester entering
 * "Mariana Alexander" got "MarianaAlexander". The field doubles as the Base UI
 * Popover trigger for the people typeahead, and Base UI's non-native button
 * emulation calls preventDefault() on the Space keydown (Space activates a
 * button), so the space character never reached the input. Hyphen and
 * apostrophe were never affected, which is why the report named only the space.
 *
 * The handler name is printed on the check-in sheet, the running order, the
 * catalog and the official registry entry form, so a name silently collapsed
 * here is wrong on paper at the show.
 */

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ people: [], loadPeople: vi.fn(), isLoading: false }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { roles: ['exhibitor'] } }),
}));

// No ownerName: the field starts empty, so the whole name is typed into it and
// the "Reset to owner" button never mounts mid-typing (which would move focus in
// jsdom and truncate the run for a reason that has nothing to do with the bug).
const ZIVA = { id: 'dog-1', callName: 'Ziva' } as unknown as Dog;

function renderDialog(onHandlerAssignment: (a: Record<string, HandlerInfo>) => void = () => {}) {
  render(
    <HandlerSelectionDialog
      open
      onOpenChange={() => {}}
      selectedDogs={[ZIVA.id]}
      dogs={[ZIVA]}
      onHandlerAssignment={onHandlerAssignment}
    />
  );
  return screen.getByLabelText('Handler name');
}

describe('HandlerSelectionDialog — handler name entry (MYK9-567)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('keeps the space in a two-part handler name', async () => {
    const field = renderDialog();
    await userEvent.setup().type(field, 'Mariana Alexander');
    expect(field).toHaveValue('Mariana Alexander');
  }, 20000);

  it('keeps hyphens and apostrophes alongside the space', async () => {
    const field = renderDialog();
    await userEvent.setup().type(field, "Mary-Jane O'Brien");
    expect(field).toHaveValue("Mary-Jane O'Brien");
  }, 20000);

  // Known-answer control for the harness itself: a name with no space must come
  // through whole. If this ever fails, the two assertions above are reporting a
  // typing-harness fault rather than anything about the handler field.
  it('control — a single-token name with punctuation types through intact', async () => {
    const field = renderDialog();
    await userEvent.setup().type(field, "Mary-Jane.O'Brien");
    expect(field).toHaveValue("Mary-Jane.O'Brien");
  }, 20000);

  it('hands the spaced name to the caller on Confirm Handler', async () => {
    const onHandlerAssignment = vi.fn();
    const field = renderDialog(onHandlerAssignment);
    const user = userEvent.setup();
    await user.type(field, 'Mariana Alexander');
    await user.click(screen.getByRole('button', { name: 'Confirm Handler' }));

    expect(onHandlerAssignment).toHaveBeenCalledWith({
      'dog-1': { handlerId: '', handlerName: 'Mariana Alexander', isOwner: false },
    });
  }, 20000);
});
