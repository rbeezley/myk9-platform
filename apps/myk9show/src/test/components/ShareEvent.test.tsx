import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';

// Mock share utility
vi.mock('@/utils/share', () => ({
  shareOrCopy: vi.fn().mockResolvedValue('copied'),
}));

describe('ShareEvent', () => {
  const shareData = {
    title: 'Jayhawk Agility Trial',
    text: 'AKC Dog Show in Olathe, KS',
    url: 'https://myk9show.com/shows/123',
  };

  it('renders Facebook share button', () => {
    render(<ShareEvent shareData={shareData} />);
    const fbLink = screen.getByLabelText(/share on facebook/i);
    expect(fbLink).toBeInTheDocument();
    expect(fbLink).toHaveAttribute('href', expect.stringContaining('facebook.com/sharer'));
  });

  it('renders Email share button', () => {
    render(<ShareEvent shareData={shareData} />);
    const emailLink = screen.getByLabelText(/share via email/i);
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute('href', expect.stringContaining('mailto:'));
  });

  it('renders Copy Link button', () => {
    render(<ShareEvent shareData={shareData} />);
    expect(screen.getByLabelText(/copy link/i)).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<ShareEvent shareData={shareData} />);
    expect(screen.getByText(/share this event/i)).toBeInTheDocument();
  });
});
