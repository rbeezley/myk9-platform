import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen } from '@/test/utils/testUtils';
import { ShowPublicLanding } from '../ShowPublicLanding';

vi.mock('@/features/monogram/landing/MonogramLandingPage', () => ({
  MonogramLandingPage: () => <div data-testid="monogram-landing" />,
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return { id: 'show-1', name: 'Spring Trial', style: null, ...overrides } as Show;
}

function renderLanding(show: Show, styleMode?: 'public' | 'manager-draft-preview') {
  const props = {
    landingTrials: [{ id: 'trial-1' } as unknown as Trial],
    hasEntryClassInventory: null,
    entryWindowNotOpen: false,
    ...(styleMode ? { styleMode } : {}),
  };
  return render(<ShowPublicLanding show={show} {...props} />);
}

describe('ShowPublicLanding frame (MYK9-1288)', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockClear();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    document.title = 'Before';
  });

  afterEach(() => {
    document.title = '';
  });

  it('offers an All shows link back to /shows on the public page', () => {
    renderLanding(makeShow());

    const nav = screen.getByRole('navigation', { name: 'Show page' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All shows' })).toHaveAttribute('href', '/shows');
  });

  it('leaves the manager draft preview to its own exit bar', () => {
    renderLanding(makeShow(), 'manager-draft-preview');

    expect(screen.queryByRole('link', { name: 'All shows' })).not.toBeInTheDocument();
  });

  it('titles the tab with the show name and restores the previous title on unmount', () => {
    const { unmount } = renderLanding(makeShow());

    expect(document.title).toBe('Spring Trial | myK9Show');
    unmount();
    expect(document.title).toBe('Before');
  });

  it('scrolls to the top on mount and again when the show changes', () => {
    const { rerender } = renderLanding(makeShow());
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'auto' });

    rerender(
      <ShowPublicLanding
        show={makeShow({ id: 'show-2' })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryWindowNotOpen={false}
      />
    );
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
