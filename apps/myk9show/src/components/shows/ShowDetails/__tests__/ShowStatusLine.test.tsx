import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShowStatusLine } from '../ShowStatusLine';
import type { Show } from '@/types/show-types';

const control = vi.hoisted(() => ({
  value: {
    infoState: 'ready' as 'ready' | 'loading',
    hasPublishedPremium: false,
    landingUnpublished: false,
  },
}));

vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => control.value,
}));
// The real pill (its status menu is covered by ShowStatusPill tests) needs the router and club
// queries; this test is about how the line composes, so a faithful stand-in prints the same label.
vi.mock('@/components/shows/ShowStatusPill', () => ({
  ShowStatusPill: ({ status, plain }: { status: string; plain?: boolean }) => (
    <button type="button" aria-label="Published" data-plain={String(Boolean(plain))}>
      {status === 'published' ? 'Published' : status}
    </button>
  ),
}));

const show = { id: 'show-1', status: 'published', clubId: 'club-1' } as Show;

describe('ShowStatusLine (MYK9-1282)', () => {
  beforeEach(() => {
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: false };
  });

  it('is ONE line: the status, then the unpublished premium, with no separate chip', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ShowStatusLine show={show} canManageShow showPublishing onOpenPublishing={onOpen} />
    );

    expect(container.textContent).toBe('Published·premium list not yet published');
    // setupReadinessSignals links #show-status-control to this line.
    expect(container.querySelector('#show-status-control')).not.toBeNull();
    // The status stays the (plain) publish/unpublish control; the nudge still opens the card.
    expect(screen.getByRole('button', { name: 'Published' })).toHaveAttribute('data-plain', 'true');
    expect(screen.queryByText('Premium not published')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'premium list not yet published' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is just the status once the premium is published, off the Overview, or for non-managers', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: false };
    const { container, rerender } = render(
      <ShowStatusLine show={show} canManageShow showPublishing onOpenPublishing={vi.fn()} />
    );
    expect(container.textContent).toBe('Published');

    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: false };
    rerender(
      <ShowStatusLine show={show} canManageShow showPublishing={false} onOpenPublishing={vi.fn()} />
    );
    expect(container.textContent).toBe('Published');

    rerender(
      <ShowStatusLine show={show} canManageShow={false} showPublishing onOpenPublishing={vi.fn()} />
    );
    expect(container.textContent).toBe('Published');
  });
});
