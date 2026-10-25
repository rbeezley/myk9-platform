import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render, screen, within } from '@/test/utils/testUtils';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import { ShowPublicLanding } from '../ShowPublicLanding';

const officials = vi.hoisted(() => ({
  current: { data: undefined, isError: false, isSuccess: false } as Record<string, unknown>,
}));
vi.mock('@/features/monogram/landing/MonogramLandingPage', async () => {
  const { LateEntryContact } = await import('@/features/_shared/landing/LateEntryContact');
  return {
    MonogramLandingPage: () => (
      <div data-testid="monogram-landing">
        <LateEntryContact />
      </div>
    ),
  };
});
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => officials.current,
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
    officials.current = { data: undefined, isError: false, isSuccess: false };
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

  it('restores the original title after the show was renamed while mounted', () => {
    const { rerender, unmount } = renderLanding(makeShow({ name: 'Spring Trial' }));
    rerender(
      <ShowPublicLanding
        show={makeShow({ name: 'Spring Trial (moved)' })}
        landingTrials={[]}
        hasEntryClassInventory={null}
        entryWindowNotOpen={false}
      />
    );
    expect(document.title).toBe('Spring Trial (moved) | myK9Show');
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

  describe('results for a show that has happened', () => {
    const past = { startDate: '2020-10-17', endDate: '2020-10-18' };
    const released = (id: string, name: string, at: string | null): ClassInfo =>
      ({
        id,
        name,
        trialId: 'trial-1',
        trialDate: '2020-10-17',
        trialNumber: 'Trial 1',
        resultsReleasedAt: at,
      }) as unknown as ClassInfo;

    function renderWithClasses(show: Show, offeredClasses: ClassInfo[]) {
      return render(
        <ShowPublicLanding
          show={show}
          landingTrials={[{ id: 'trial-1' } as unknown as Trial]}
          offeredClasses={offeredClasses}
          hasEntryClassInventory
          entryWindowNotOpen={false}
        />
      );
    }

    it('links each released class to its public results page and omits withheld classes', () => {
      renderWithClasses(makeShow(past), [
        released('class-a', 'Container Novice A', '2020-10-18T20:00:00Z'),
        released('class-b', 'Withheld Interior Master', null),
      ]);

      const region = screen.getByRole('region', { name: 'Results' });
      const link = within(region).getByRole('link', { name: /Container Novice A/ });
      expect(link).toHaveAttribute('href', '/shows/show-1/trials/trial-1/classes/class-a/results');
      expect(screen.queryByText(/Withheld Interior Master/)).not.toBeInTheDocument();
      expect(within(region).queryByText(/have not been released/i)).not.toBeInTheDocument();
    });

    it('says results have not been released when no class has released', () => {
      renderWithClasses(makeShow(past), [released('class-b', 'Withheld Interior Master', null)]);

      const region = screen.getByRole('region', { name: 'Results' });
      expect(within(region).getByText('Results have not been released yet.')).toBeInTheDocument();
      expect(within(region).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText(/Withheld Interior Master/)).not.toBeInTheDocument();
    });

    function renderWarmStore(classes: ClassInfo[]) {
      // A signed-in exhibitor whose replica holds the show: the public read is empty.
      return render(
        <ShowPublicLanding
          show={makeShow(past)}
          landingTrials={[{ id: 'trial-1' } as unknown as Trial]}
          offeredClasses={[]}
          resultClasses={classes}
          hasEntryClassInventory
          entryWindowNotOpen={false}
        />
      );
    }

    it('links a released class from the warm store when the public read is empty', () => {
      renderWarmStore([
        released('class-a', 'Container Novice A', '2020-10-18T20:00:00Z'),
        released('class-b', 'Withheld Interior Master', null),
      ]);

      const region = screen.getByRole('region', { name: 'Results' });
      expect(within(region).getByRole('link', { name: /Container Novice A/ })).toHaveAttribute(
        'href',
        '/shows/show-1/trials/trial-1/classes/class-a/results'
      );
      expect(screen.queryByText(/Withheld Interior Master/)).not.toBeInTheDocument();
    });

    it('says not released from the warm store when no class has released', () => {
      renderWarmStore([released('class-b', 'Withheld Interior Master', null)]);

      expect(screen.getByText('Results have not been released yet.')).toBeInTheDocument();
    });

    it('renders nothing from an empty warm-store list', () => {
      renderWarmStore([]);

      expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument();
    });

    it('shows no results block for an upcoming show', () => {
      renderWithClasses(makeShow({ startDate: '2999-10-17', endDate: '2999-10-18' }), [
        released('class-a', 'Container Novice A', '2020-10-18T20:00:00Z'),
      ]);

      expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument();
    });
  });

  describe('late-entry contact states', () => {
    const neutral = 'Contact the trial secretary for late-entry help.';

    it('stays neutral while the officials read is loading', () => {
      renderLanding(makeShow());
      expect(screen.getByText(neutral)).toBeInTheDocument();
      expect(screen.queryByText(/has not listed/)).not.toBeInTheDocument();
    });

    it('stays neutral when the officials read failed', () => {
      officials.current = { data: undefined, isError: true, isSuccess: false };
      renderLanding(makeShow());
      expect(screen.getByText(neutral)).toBeInTheDocument();
      expect(screen.queryByText(/has not listed/)).not.toBeInTheDocument();
    });

    it('says none is listed only once the read succeeded with no secretary', () => {
      officials.current = {
        data: { secretaries: [], chairmen: [], stewards: [] },
        isError: false,
        isSuccess: true,
      };
      renderLanding(makeShow());
      expect(screen.getByText('The club has not listed a secretary yet.')).toBeInTheDocument();
    });
  });
});
