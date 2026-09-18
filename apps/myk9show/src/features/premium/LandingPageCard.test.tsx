import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LandingPageCard } from './LandingPageCard';

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LandingPageCard', () => {
  it('keeps both actions full-width and touch-sized on mobile', () => {
    render(<LandingPageCard showId="show-1" showStyle="heritage" />);

    const copy = screen.getByRole('button', { name: /Copy Link/i });
    const preview = screen.getByRole('link', { name: /Preview/i });
    // The pair now shares one row, so the full-width-on-mobile promise moved to
    // the group and each control takes half of it. The 44px floor stays per
    // control -- that is the one this test was written to protect.
    for (const control of [copy, preview]) {
      expect(control).toHaveClass('min-h-[44px]', 'flex-1', 'sm:flex-none');
    }
    expect(copy.parentElement).toHaveClass('w-full', 'sm:w-auto');
    expect(screen.getByText('Public Landing Page')).toHaveClass('truncate');
  });

  it('offers the exhibitor preview beside the URL it previews', () => {
    // This link used to live in the show header's `...` overflow menu, which
    // MYK9-630 deletes; it belongs next to the URL it acts on.
    render(<LandingPageCard showId="show-1" showStyle="heritage" />);

    expect(screen.getByRole('link', { name: /Preview/i })).toHaveAttribute(
      'href',
      '/shows/show-1?preview=public'
    );
  });
});
