import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishAttentionChip } from '../PublishAttentionChip';

const control = vi.hoisted(() => ({
  value: {
    infoState: 'ready' as 'ready' | 'loading' | 'unavailable' | 'offline',
    hasPublishedPremium: false,
    landingUnpublished: false,
  },
}));

vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => control.value,
}));

describe('PublishAttentionChip', () => {
  beforeEach(() => {
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: false };
  });

  it('says the premium list is not published, and opens the details panel on click', () => {
    const onOpen = vi.fn();
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Premium not published' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says the landing page is not published once the premium list is', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Landing page not published' })).toBeInTheDocument();
  });

  it('renders nothing once both are published', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: false };
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for someone who cannot manage the show, or while the state is unknown', () => {
    const { container, rerender } = render(
      <PublishAttentionChip showId="show-1" canManageShow={false} onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    control.value = { infoState: 'loading', hasPublishedPremium: false, landingUnpublished: false };
    rerender(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
