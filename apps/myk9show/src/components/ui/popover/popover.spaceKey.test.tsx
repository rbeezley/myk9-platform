import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverTrigger, PopoverContent, isTextEntryElement } from './popover';

/**
 * MYK9-567: Base UI's popover trigger emulates button activation on a
 * non-native trigger, which `preventDefault()`s the Space keydown. When the
 * trigger IS a text input (the combobox pattern used for handler names, dog
 * search and armband lookup) that silently swallows every space the person
 * types. `PopoverTrigger` now stops Base UI's key handler for text-entry
 * triggers only — a real button trigger must keep Space-as-activation.
 */

describe('PopoverTrigger — Space on a text-entry trigger (MYK9-567)', () => {
  it('lets a text input receive the space character', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild nativeButton={false}>
          <input aria-label="Handler" defaultValue="" />
        </PopoverTrigger>
      </Popover>
    );

    const input = screen.getByLabelText('Handler') as HTMLInputElement;
    await userEvent.setup().type(input, 'Mariana Alexander');
    expect(input.value).toBe('Mariana Alexander');
  }, 20000);

  /**
   * A native <button> is activated by the browser, not by `useButton`, so that
   * case alone stays green even if the guard is broadened to swallow Space on
   * EVERY trigger. This non-native trigger is the one that actually depends on
   * Base UI's emulation, so it is what fails if the predicate stops
   * discriminating.
   */
  it('still opens the popover from a non-native trigger with Space', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild nativeButton={false}>
          <div tabIndex={0}>Open</div>
        </PopoverTrigger>
        <PopoverContent>
          <span>Panel</span>
        </PopoverContent>
      </Popover>
    );

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    await user.keyboard(' ');

    expect(await screen.findByText('Panel')).toBeVisible();
  }, 20000);

  it('still activates a real button trigger with Space', async () => {
    const onClick = vi.fn();
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" onClick={onClick}>
            Open
          </button>
        </PopoverTrigger>
      </Popover>
    );

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalled();
  }, 20000);
});

describe('PopoverTrigger — Space must not activate a text-entry trigger (MYK9-567)', () => {
  /**
   * Stopping Base UI's keyDOWN handler restores the character, but `useButton`
   * has a SECOND non-native activation path on keyUP that dispatches a
   * synthetic click. `useClick` turns that click into a popover toggle, so the
   * typeahead list flickered shut on every space while the rest of the name
   * typed fine — the same root cause wearing different clothes. Both halves
   * have to be stopped for a text trigger.
   */
  function renderTextTrigger() {
    const onClick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Popover open onOpenChange={onOpenChange}>
        <PopoverTrigger asChild nativeButton={false}>
          <input aria-label="Handler" defaultValue="" onClick={onClick} />
        </PopoverTrigger>
      </Popover>
    );
    return { onClick, onOpenChange, input: screen.getByLabelText('Handler') as HTMLInputElement };
  }

  it('dispatches no click on the input when a space is typed', async () => {
    const { onClick, input } = renderTextTrigger();
    input.focus();
    await userEvent.setup().keyboard('a b');

    expect(input.value).toBe('a b');
    expect(onClick).not.toHaveBeenCalled();
  }, 20000);

  it('does not toggle the popover open state while a space is typed', async () => {
    const { onOpenChange, input } = renderTextTrigger();
    input.focus();
    await userEvent.setup().keyboard('a b');

    expect(onOpenChange).not.toHaveBeenCalled();
  }, 20000);

  it('control — typing with no space dispatches no click either', async () => {
    const { onClick, onOpenChange, input } = renderTextTrigger();
    input.focus();
    await userEvent.setup().keyboard('ab');

    expect(input.value).toBe('ab');
    expect(onClick).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  }, 20000);
});

describe('isTextEntryElement', () => {
  function el(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as HTMLElement;
  }

  it.each([
    ['<input />', true],
    ['<input type="text" />', true],
    ['<input type="search" />', true],
    ['<input type="email" />', true],
    ['<input type="number" />', true],
    ['<textarea></textarea>', true],
    ['<input type="checkbox" />', false],
    ['<input type="button" />', false],
    ['<input type="file" />', false],
    ['<button></button>', false],
    ['<div></div>', false],
    ['<span role="combobox"></span>', false],
    // jsdom leaves `isContentEditable` undefined, so the predicate reads the
    // attribute. Nothing else exercises that branch.
    ['<div contenteditable></div>', true],
    ['<div contenteditable="true"></div>', true],
    ['<div contenteditable="plaintext-only"></div>', true],
    ['<div contenteditable="false"></div>', false],
  ])('%s -> %s', (html, expected) => {
    expect(isTextEntryElement(el(html))).toBe(expected);
  });

  it('is false for null', () => {
    expect(isTextEntryElement(null)).toBe(false);
  });
});
