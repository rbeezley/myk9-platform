import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverTrigger, isTextEntryElement } from './popover';

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
  ])('%s -> %s', (html, expected) => {
    expect(isTextEntryElement(el(html))).toBe(expected);
  });

  it('is false for null', () => {
    expect(isTextEntryElement(null)).toBe(false);
  });
});
