import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import DogDetailsTabs from './DogDetailsTabs';
import type { Dog } from '@/types/dog-types';

// Mock all lazy-loaded section components — they make real API calls
vi.mock('@/components/dogs/DogDetails/TrainingJournal/TrainingSection', () => ({
  default: () => <div>training section</div>,
}));
vi.mock('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection', () => ({
  default: () => <div>health records section</div>,
}));
vi.mock('@/components/dogs/DogDetails/Competitions/CompetitionsTabs', () => ({
  default: () => <div>competitions section</div>,
}));
vi.mock('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection', () => ({
  default: () => <div>title progress section</div>,
}));
vi.mock('@/components/dogs/DogDetails/Pedigree/PedigreeSection', () => ({
  default: () => <div>pedigree section</div>,
}));
vi.mock('@/components/common/ActivityTimeline', () => ({
  default: () => <div>activity timeline</div>,
}));
vi.mock('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection', () => ({
  default: () => <div>statistics section</div>,
}));

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: vi.fn(),
}));

// Enable all tabs so BlurGate behavior is tested regardless of release flags
vi.mock('@/config/features', () => ({
  features: {
    titleTracking: true,
    trainingJournal: true,
    healthRecords: true,
    pedigree: true,
    competitionsTab: true,
    statisticsTab: true,
    showRegistration: false,
    myEntries: false,
    calendar: false,
    showDay: false,
    analytics: false,
  },
}));

import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { fromPartial } from '@total-typescript/shoehorn';

const mockDog = fromPartial<Dog>({
  id: 'dog-1',
  name: 'Buddy',
  callName: 'Buddy',
  breed: 'Border Collie',
  dateOfBirth: '2020-01-01',
  sex: 'male',
  ownerId: 'user-1',
});

function setFree() {
  vi.mocked(useSubscriptionGate).mockReturnValue({
    isPremium: false,
    canAuthorizePremium: false,
    tier: 'free',
    isExpired: false,
    isInTrial: false,
    isEarlyAdopter: false,
    foundingUntil: null,
    isLoading: false,
  });
}

function setPremium() {
  vi.mocked(useSubscriptionGate).mockReturnValue({
    isPremium: true,
    canAuthorizePremium: true,
    tier: 'premium',
    isExpired: false,
    isInTrial: false,
    isEarlyAdopter: false,
    foundingUntil: null,
    isLoading: false,
  });
}

/** Display tier says Premium, but the entitlement read is not trusted. */
function setUntrustedPremium() {
  vi.mocked(useSubscriptionGate).mockReturnValue({
    isPremium: true,
    canAuthorizePremium: false,
    tier: 'premium',
    isExpired: false,
    isInTrial: false,
    isEarlyAdopter: false,
    foundingUntil: null,
    isLoading: false,
  });
}

/** Renders DogDetailsTabs behind a route so location/back/forward work. */
function renderAt(initialRoute: string, dog: Dog = mockDog) {
  return render(
    <Routes>
      <Route
        path="/dogs/:id"
        element={<DogDetailsTabs dog={dog} autoOpenAddRegistration={false} />}
      />
    </Routes>,
    { initialRoute }
  );
}

describe('DogDetailsTabs navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setFree();
  });

  describe('default Overview', () => {
    it('selects Overview with no section state in the URL', () => {
      renderAt('/dogs/dog-1');
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('renders registrations and one Activity section, with no separate Activity tab', () => {
      renderAt('/dogs/dog-1');
      expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /activity/i })).not.toBeInTheDocument();
    });

    it('renders exactly one Activity heading (not repeated per view)', () => {
      renderAt('/dogs/dog-1');
      expect(screen.getAllByRole('heading', { name: 'Activity' })).toHaveLength(1);
    });
  });

  describe('Career secondary views', () => {
    it('opens Career with Competitions as the default secondary view', async () => {
      renderAt('/dogs/dog-1?section=career');
      expect(screen.getByRole('tab', { name: 'Career' })).toHaveAttribute('aria-selected', 'true');
      expect(await screen.findByText('competitions section')).toBeInTheDocument();
    });

    it('opens the requested Career secondary view (Title Progress)', () => {
      renderAt('/dogs/dog-1?section=career&view=titles');
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
    });

    it('opens the requested Career secondary view (Statistics)', () => {
      renderAt('/dogs/dog-1?section=career&view=statistics');
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
    });

    it('keeps top-level navigation as Overview, Career, Records', () => {
      renderAt('/dogs/dog-1?section=career');
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Career' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Records' })).toBeInTheDocument();
    });
  });

  describe('Records secondary views', () => {
    it('opens Records with Health as the default secondary view', async () => {
      renderAt('/dogs/dog-1?section=records');
      expect(screen.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('heading', { name: 'Records are read-only' })).toBeInTheDocument();
      expect(await screen.findByText('health records section')).toBeInTheDocument();
    });

    it('opens the requested Records secondary view (Training)', async () => {
      renderAt('/dogs/dog-1?section=records&view=training');
      expect(screen.getByRole('heading', { name: 'Records are read-only' })).toBeInTheDocument();
      expect(await screen.findByText('training section')).toBeInTheDocument();
    });

    it('opens the requested Records secondary view (Pedigree)', async () => {
      renderAt('/dogs/dog-1?section=records&view=pedigree');
      expect(screen.getByRole('heading', { name: 'Records are read-only' })).toBeInTheDocument();
      expect(await screen.findByText('pedigree section')).toBeInTheDocument();
    });
  });

  describe('legacy tab link mapping', () => {
    it.each([
      ['tab=registrations', 'Overview'],
      ['tab=competitions', 'Career'],
      ['tab=title-progress', 'Career'],
      ['tab=statistics', 'Career'],
      ['tab=health-records', 'Records'],
      ['tab=training-journal', 'Records'],
      ['tab=pedigree', 'Records'],
    ])('maps legacy ?%s to the %s section', (query, expectedTopLevel) => {
      renderAt(`/dogs/dog-1?${query}`);
      expect(screen.getByRole('tab', { name: expectedTopLevel })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('maps legacy tab=title-progress to the Title Progress secondary view', () => {
      renderAt('/dogs/dog-1?tab=title-progress');
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
      expect(screen.getByText('Title Progress')).toBeInTheDocument();
    });
  });

  describe('copied deep links', () => {
    it('a copied Records/Pedigree link opens directly on that view', async () => {
      renderAt('/dogs/dog-1?section=records&view=pedigree');
      expect(screen.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');
      expect(await screen.findByText('pedigree section')).toBeInTheDocument();
    });
  });

  describe('Back/Forward behavior', () => {
    // Uses a real BrowserRouter (not MemoryRouter) so window.history.back()/
    // forward() exercise the same popstate path a real Back button does.
    it('moving from Overview to Career and back with browser Back restores Overview, then Forward restores Career', async () => {
      window.history.pushState({}, '', '/dogs/dog-1');
      const { user } = render(
        <Routes>
          <Route
            path="/dogs/:id"
            element={<DogDetailsTabs dog={mockDog} autoOpenAddRegistration={false} />}
          />
        </Routes>,
        { initialRoute: '' }
      );

      await user.click(screen.getByRole('tab', { name: 'Career' }));
      expect(screen.getByRole('tab', { name: 'Career' })).toHaveAttribute('aria-selected', 'true');

      window.history.back();
      await screen.findByRole('tab', { name: 'Overview', selected: true });

      window.history.forward();
      await screen.findByRole('tab', { name: 'Career', selected: true });
    });
  });

  describe('lock discovery', () => {
    it('free user: Competitions stays usable in Career', async () => {
      renderAt('/dogs/dog-1?section=career');
      expect(await screen.findByText('competitions section')).toBeInTheDocument();
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });

    it('free user: Title Progress and Statistics expose one consistent locked treatment', () => {
      renderAt('/dogs/dog-1?section=career&view=titles');
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
      expect(
        screen.getByText("Monitor your dog's progress toward titles and certifications.")
      ).toBeInTheDocument();
    });

    it('free user: Records exposes one coherent locked treatment for Health', async () => {
      renderAt('/dogs/dog-1?section=records');
      expect(screen.getByRole('heading', { name: 'Records are read-only' })).toBeInTheDocument();
      expect(await screen.findByText('health records section')).toBeInTheDocument();
    });

    it('premium user: no BlurGate overlay on Career/Title Progress', async () => {
      setPremium();
      renderAt('/dogs/dog-1?section=career&view=titles');
      // Await the section before asserting the overlay is absent: the sections are
      // `lazy()`-loaded, so a synchronous query would run against the Suspense
      // skeleton and pass vacuously (and `getByText` for the section would fail
      // outright unless an earlier test had already warmed the lazy import).
      expect(await screen.findByText('title progress section')).toBeInTheDocument();
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });

    it('premium user: no BlurGate overlay on Records/Pedigree', async () => {
      setPremium();
      renderAt('/dogs/dog-1?section=records&view=pedigree');
      expect(await screen.findByText('pedigree section')).toBeInTheDocument();
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });

    it('untrusted entitlement: Records stays read-only even though display says Premium', async () => {
      // The legacy profile fallback can keep `isPremium` true when the trusted
      // entitlement read is unavailable. Offering add/edit there would surface
      // controls the server rejects, so writes key on `canAuthorizePremium`.
      setUntrustedPremium();
      renderAt('/dogs/dog-1?section=records');
      expect(screen.getByRole('heading', { name: 'Records are read-only' })).toBeInTheDocument();
      expect(await screen.findByText('health records section')).toBeInTheDocument();
    });

    it('untrusted entitlement: the DISPLAY lock on Title Progress stays open', async () => {
      // Display and authorization are separate axes — an untrusted read must
      // not slam a blur gate over a view-only Premium panel.
      setUntrustedPremium();
      renderAt('/dogs/dog-1?section=career&view=titles');
      expect(await screen.findByText('title progress section')).toBeInTheDocument();
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });
  });

  describe('secretary role', () => {
    it('renders Registrations and a vaccinations-only Health Records section, no Overview/Career/Records strip', () => {
      render(<DogDetailsTabs dog={mockDog} autoOpenAddRegistration={false} role="secretary" />);
      expect(screen.getByRole('heading', { name: 'Health Records' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Career' })).not.toBeInTheDocument();
    });
  });
});
