import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import ShowResultsSection from './ShowResultsSection';

vi.mock('@/features/results-tab/ResultsTab', () => ({
  default: ({ showStatsLink }: { showStatsLink: ReactNode }) => (
    <>
      <p>Managed results</p>
      {showStatsLink}
    </>
  ),
}));
vi.mock('@/components/analytics/ShowStatsSubTab', () => ({
  ShowStatsSubTab: () => <p>Existing statistics view</p>,
}));

it('opens Show Stats from managed Results and returns to the same Results filters', async () => {
  const { user } = render(
    <Routes>
      <Route path="/shows/:showId/results" element={<ShowResultsSection />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?status=ready' }
  );
  expect(await screen.findByText('Managed results')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Show Stats' }));
  expect(await screen.findByText('Existing statistics view')).toBeInTheDocument();
  fireEvent(window, new Event('offline'));
  expect(screen.getByRole('status')).toHaveTextContent('Show Stats needs a connection');
  expect(screen.queryByText('Existing statistics view')).not.toBeInTheDocument();
  const back = screen.getByRole('link', { name: 'Back to Results' });
  expect(back).toHaveAttribute('href', '/shows/show-1/results?status=ready');
  await user.click(back);
  expect(await screen.findByText('Managed results')).toBeInTheDocument();
});
