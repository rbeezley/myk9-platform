import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { FirstRunZeroState } from '../FirstRunZeroState';

describe('FirstRunZeroState', () => {
  describe('no dogs yet (true first run)', () => {
    it('leads with adding a dog and a welcome message', () => {
      render(<FirstRunZeroState hasDogs={false} onAddDog={vi.fn()} />);
      expect(screen.getByText(/Welcome!/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add Your First Dog/i })).toBeInTheDocument();
    });

    it('still offers browsing shows as a secondary path', () => {
      render(<FirstRunZeroState hasDogs={false} onAddDog={vi.fn()} />);
      const browse = screen.getByRole('link', { name: /Browse Shows/i });
      expect(browse).toHaveAttribute('href', '/shows');
    });

    it('does not render any zeroed stat values', () => {
      render(<FirstRunZeroState hasDogs={false} onAddDog={vi.fn()} />);
      // The whole point of the zero-state is to suppress the "0" stat noise.
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('invokes onAddDog when the primary action is clicked', async () => {
      const onAddDog = vi.fn();
      render(<FirstRunZeroState hasDogs={false} onAddDog={onAddDog} />);
      await userEvent.click(screen.getByRole('button', { name: /Add Your First Dog/i }));
      expect(onAddDog).toHaveBeenCalledTimes(1);
    });
  });

  describe('has dogs but no entries', () => {
    it('leads with browsing shows', () => {
      render(<FirstRunZeroState hasDogs onAddDog={vi.fn()} />);
      expect(screen.getByText(/find a show/i)).toBeInTheDocument();
      const browse = screen.getByRole('link', { name: /Browse Shows/i });
      expect(browse).toHaveAttribute('href', '/shows');
    });

    it('keeps adding another dog available as a secondary action', async () => {
      const onAddDog = vi.fn();
      render(<FirstRunZeroState hasDogs onAddDog={onAddDog} />);
      await userEvent.click(screen.getByRole('button', { name: /Add Another Dog/i }));
      expect(onAddDog).toHaveBeenCalledTimes(1);
    });

    it('does not show the first-run "Add Your First Dog" copy', () => {
      render(<FirstRunZeroState hasDogs onAddDog={vi.fn()} />);
      expect(screen.queryByText(/Add Your First Dog/i)).not.toBeInTheDocument();
    });
  });
});
