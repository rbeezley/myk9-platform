import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import CareerSection from './CareerSection';

vi.mock('@/components/dogs/DogDetails/Competitions/CompetitionsTabs', () => ({
  default: () => <div>Competitions content</div>,
}));
vi.mock('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection', () => ({
  default: () => <div>Title progress content</div>,
}));
vi.mock('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection', () => ({
  default: () => <div>Statistics content</div>,
}));

describe('CareerSection locked state', () => {
  it('shows the Premium upgrade gate instead of Title Progress content when locked', async () => {
    render(
      <CareerSection
        dogId="dog-1"
        ownerId="owner-1"
        view="titles"
        onViewChange={vi.fn()}
        isPremium={false}
        locked
        viewer="exhibitor"
      />
    );

    await waitFor(() => expect(screen.getByText(/premium feature/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Title Progress' })).toBeInTheDocument();
  });

  it('shows the Premium upgrade gate instead of Statistics content when locked', async () => {
    render(
      <CareerSection
        dogId="dog-1"
        ownerId="owner-1"
        view="statistics"
        onViewChange={vi.fn()}
        isPremium={false}
        locked
        viewer="exhibitor"
      />
    );

    await waitFor(() => expect(screen.getByText(/premium feature/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });

  it('renders Title Progress content directly when not locked', async () => {
    render(
      <CareerSection
        dogId="dog-1"
        ownerId="owner-1"
        view="titles"
        onViewChange={vi.fn()}
        isPremium
        locked={false}
        viewer="exhibitor"
      />
    );

    await waitFor(() => expect(screen.getByText('Title progress content')).toBeInTheDocument());
    expect(screen.queryByText(/premium feature/i)).not.toBeInTheDocument();
  });
});
