import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import ShowResultsSection from '../ShowResultsSection';

vi.mock('@/features/results-tab/ResultsTab', () => ({
  default: () => <div data-testid="results-tab" />,
}));
vi.mock('@/pages/secretary/ResultsSubmissionPage', () => ({
  default: () => <div data-testid="step-submit" />,
}));
vi.mock('@/pages/secretary/ShowCloseStep', () => ({
  default: () => <div data-testid="step-close" />,
}));

function renderAt(search: string) {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ShowResultsSection />} />
    </Routes>,
    { initialRoute: `/shows/show-1/results${search}` }
  );
}

describe('ShowResultsSection (MYK9-1031: the class list, with Submit and Close behind it)', () => {
  it('opens on the class list, with no step buttons of its own', async () => {
    renderAt('');

    expect(await screen.findByTestId('results-tab')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the ?step=submit and ?step=close deep links (MYK9-954 and the old /submit-results redirect)', async () => {
    const { unmount } = renderAt('?step=close');
    expect(await screen.findByTestId('step-close')).toBeInTheDocument();
    unmount();

    renderAt('?step=submit');
    expect(await screen.findByTestId('step-submit')).toBeInTheDocument();
  });

  it('offers a way back to the class list from Submit and Close', async () => {
    renderAt('?step=submit');

    expect(await screen.findByRole('link', { name: 'All classes' })).toHaveAttribute(
      'href',
      '/shows/show-1/results'
    );
  });

  it('falls back to the class list for an unknown step', async () => {
    renderAt('?step=bogus');

    expect(await screen.findByTestId('results-tab')).toBeInTheDocument();
  });
});
