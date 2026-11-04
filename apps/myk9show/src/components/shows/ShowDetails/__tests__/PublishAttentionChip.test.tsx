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

const store = vi.hoisted(() => ({
  shows: [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: false }] as Record<
    string,
    unknown
  >[],
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { shows: unknown[] }) => unknown) =>
    selector({ shows: store.shows }),
}));

vi.mock('@/features/premium/usePremiumPublishControl', () => ({
  usePremiumPublishControl: () => control.value,
}));

describe('PublishAttentionChip', () => {
  beforeEach(() => {
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: false };
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: false }];
  });

  it('says the premium list is not published, and opens About on the premium card on click', () => {
    const onOpen = vi.fn();
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'premium list not yet published' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('setup-publish-premium');
  });

  it('says the landing page is not published once the premium list is', () => {
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    const onOpen = vi.fn();
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'landing page not yet published' }));
    expect(onOpen).toHaveBeenCalledWith('setup-publish-premium');
  });

  it('says nothing about the premium list when the club publishes its own (MYK9-1686)', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still nudges the landing page when the club publishes its own premium list', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'landing page not yet published' })).toBeVisible();
  });

  it('warns about the landing page with no generated premium when the club publishes its own', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: true, publishesOwnPremium: true }];
    control.value = { infoState: 'ready', hasPublishedPremium: false, landingUnpublished: true };
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'landing page not yet published' })).toBeVisible();
  });

  it('says nothing about the landing page when the show has no public landing page', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: false }];
    control.value = { infoState: 'ready', hasPublishedPremium: true, landingUnpublished: true };
    const { container } = render(
      <PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still nudges the premium list when the landing page switch is off', () => {
    store.shows = [{ id: 'show-1', usesLandingPage: false }];
    render(<PublishAttentionChip showId="show-1" canManageShow onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'premium list not yet published' })).toBeVisible();
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
