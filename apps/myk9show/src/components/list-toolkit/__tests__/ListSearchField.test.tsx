import { useState } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ListSearchField } from '../ListSearchField';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: vi.fn() }));

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ListSearchField value={value} onChange={setValue} placeholder="Search entries" />
      <button type="button">elsewhere</button>
    </>
  );
}

const narrow = (isNarrow: boolean) => vi.mocked(useMediaQuery).mockReturnValue(isNarrow);

describe('ListSearchField', () => {
  beforeEach(() => narrow(false));

  it('is a plain field from 1024px up', async () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();

    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search entries' }), 'maple');
    expect(screen.getByRole('textbox', { name: 'Search entries' })).toHaveValue('maple');
  });

  describe('below 1024px', () => {
    beforeEach(() => narrow(true));

    it('is a 44px icon until tapped, then opens the field and focuses it', async () => {
      render(<Harness />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Search' }));

      expect(screen.getByRole('textbox', { name: 'Search entries' })).toHaveFocus();
    });

    it('stays open while it holds text, even after focus leaves', async () => {
      render(<Harness initial="casey" />);
      const user = userEvent.setup();

      expect(screen.getByRole('textbox', { name: 'Search entries' })).toHaveValue('casey');
      await user.click(screen.getByRole('button', { name: 'elsewhere' }));
      expect(screen.getByRole('textbox', { name: 'Search entries' })).toBeInTheDocument();
    });

    it('closes again when empty and focus leaves', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Search' }));

      await user.click(screen.getByRole('button', { name: 'elsewhere' }));

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    });

    it('closes on Escape when empty and puts focus back on the icon', async () => {
      render(<Harness />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Search' }));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
    });

    it('clears the text on the first Escape and keeps the field open', async () => {
      render(<Harness initial="casey" />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('textbox', { name: 'Search entries' }));

      await user.keyboard('{Escape}');

      expect(screen.getByRole('textbox', { name: 'Search entries' })).toHaveValue('');
    });
  });
});
