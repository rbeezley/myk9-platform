import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ListSearchField } from '../ListSearchField';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: vi.fn() }));

/** The page around the field: it owns the text, and has controls that change it from outside. */
function Harness({
  initial = '',
  onKeyDown,
}: {
  initial?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}) {
  const [value, setValue] = useState(initial);
  const reset = useRef(() => setValue(''));
  return (
    <div onKeyDown={onKeyDown}>
      <ListSearchField value={value} onChange={setValue} placeholder="Search entries" />
      <button type="button">elsewhere</button>
      <button type="button" onClick={() => reset.current()}>
        page clear
      </button>
    </div>
  );
}

const narrow = (isNarrow: boolean) => vi.mocked(useMediaQuery).mockReturnValue(isNarrow);
const field = () => screen.queryByRole('textbox', { name: 'Search entries' });
const icon = () => screen.queryByRole('button', { name: 'Search entries' });

describe('ListSearchField', () => {
  beforeEach(() => {
    narrow(false);
    // jsdom reports no window focus; a person using the page has it.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a plain field from 1024px up', async () => {
    render(<Harness />);
    expect(icon()).not.toBeInTheDocument();

    await userEvent.setup().type(field()!, 'maple');
    expect(field()).toHaveValue('maple');
  });

  describe('below 1024px', () => {
    beforeEach(() => {
      narrow(true);
    });

    it('is a 44px icon until tapped, then opens the field and focuses it', async () => {
      render(<Harness />);
      expect(field()).not.toBeInTheDocument();
      expect(icon()).toHaveAttribute('aria-expanded', 'false');

      await userEvent.setup().click(icon()!);

      expect(field()).toHaveFocus();
    });

    it('stays open while it holds text, even after focus leaves', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(icon()!);
      await user.type(field()!, 'casey');

      await user.click(screen.getByRole('button', { name: 'elsewhere' }));

      expect(field()).toHaveValue('casey');
    });

    it('goes back to the icon when the page empties it from outside and focus is elsewhere', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(icon()!);
      await user.type(field()!, 'casey');
      await user.click(screen.getByRole('button', { name: 'elsewhere' }));

      await user.click(screen.getByRole('button', { name: 'page clear' }));

      expect(field()).not.toBeInTheDocument();
      expect(icon()).toBeInTheDocument();
    });

    it('closes again when empty and focus leaves', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(icon()!);

      await user.click(screen.getByRole('button', { name: 'elsewhere' }));

      expect(field()).not.toBeInTheDocument();
      expect(icon()).toBeInTheDocument();
    });

    it('closes on Escape when empty and puts focus back on the icon', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(icon()!);

      await user.keyboard('{Escape}');

      expect(field()).not.toBeInTheDocument();
      expect(icon()).toHaveFocus();
    });

    it('keeps that Escape to itself, so it does not also close a dialog around the list', async () => {
      const onKeyDown = vi.fn();
      render(<Harness onKeyDown={onKeyDown} />);
      const user = userEvent.setup();
      await user.click(icon()!);

      await user.keyboard('{Escape}');

      expect(onKeyDown).not.toHaveBeenCalled();
    });

    it('clears the text on the first Escape and keeps the field open', async () => {
      render(<Harness initial="casey" />);
      const user = userEvent.setup();
      await user.click(field()!);

      await user.keyboard('{Escape}');

      expect(field()).toHaveValue('');
      expect(field()).toHaveFocus();
    });

    it('keeps focus in the field after its clear button empties it', async () => {
      render(<Harness initial="casey" />);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Clear search' }));

      expect(field()).toHaveValue('');
      expect(field()).toHaveFocus();
    });

    it('does not collapse when the window loses focus, only when focus moves within the page', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(icon()!);
      const input = field()!;

      vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      fireEvent.blur(input, { relatedTarget: null });
      expect(field()).toBeInTheDocument();

      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      fireEvent.blur(input, { relatedTarget: null });
      expect(field()).not.toBeInTheDocument();
    });
  });

  it('goes back to the icon when the window narrows past 1024px with the field empty and unfocused', async () => {
    const { rerender } = render(<Harness />);
    const user = userEvent.setup();
    await user.click(field()!);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(field()).toBeInTheDocument();

    narrow(true);
    rerender(<Harness />);

    expect(field()).not.toBeInTheDocument();
    expect(icon()).toBeInTheDocument();
  });
});
