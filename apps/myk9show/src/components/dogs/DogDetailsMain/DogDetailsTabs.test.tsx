import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsTabs from './DogDetailsTabs';
import type { Dog } from '@/types/dog-types';

// Mock all lazy-loaded tab sections — they make real API calls
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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: vi.fn(),
}));

import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';

const mockDog: Dog = {
  id: 'dog-1',
  name: 'Buddy',
  call_name: 'Buddy',
  breed: 'Border Collie',
  date_of_birth: '2020-01-01',
  sex: 'Male',
  owner_id: 'user-1',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
} as Dog;

describe('DogDetailsTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('free user (isPremium=false)', () => {
    beforeEach(() => {
      vi.mocked(useSubscriptionGate).mockReturnValue({
        isPremium: false,
        tier: 'free',
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });
    });

    it.each([
      ['Title Progress', "Monitor your dog's progress toward titles and certifications."],
      [
        'Statistics',
        "Visualize your dog's performance trends, qualification rates, and achievements.",
      ],
      ['Health Records', "Keep comprehensive health records for your dog's wellbeing."],
      ['Training Journal', "Document training sessions and track your dog's progress."],
      ['Pedigree', "Explore your dog's lineage and ancestry with detailed pedigree tracking."],
    ])('shows BlurGate overlay on %s tab', async (title, description) => {
      const { user } = render(<DogDetailsTabs dog={mockDog} />);

      // Click the tab to activate it
      await user.click(screen.getByRole('tab', { name: new RegExp(title, 'i') }));

      // "Premium Feature" label and description are unique to the overlay.
      // Don't assert on `title` directly — it also appears in the tab button.
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    });

    it('does not show BlurGate on free tabs', async () => {
      render(<DogDetailsTabs dog={mockDog} />);
      // Registrations tab is default — no overlay
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });
  });

  describe('premium user (isPremium=true)', () => {
    beforeEach(() => {
      vi.mocked(useSubscriptionGate).mockReturnValue({
        isPremium: true,
        tier: 'premium',
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });
    });

    it('does not show BlurGate overlay on Title Progress tab', async () => {
      const { user } = render(<DogDetailsTabs dog={mockDog} />);
      await user.click(screen.getByRole('tab', { name: /title progress/i }));
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
      expect(screen.getByText('title progress section')).toBeInTheDocument();
    });
  });
});
