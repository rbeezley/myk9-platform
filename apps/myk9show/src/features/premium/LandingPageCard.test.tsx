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
  it('keeps the copy action full-width and touch-sized on mobile', () => {
    render(<LandingPageCard showId="show-1" showStyle="heritage" />);

    expect(screen.getByRole('button', { name: /Copy Link/i })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByText('Public Landing Page')).toHaveClass('truncate');
  });
});
