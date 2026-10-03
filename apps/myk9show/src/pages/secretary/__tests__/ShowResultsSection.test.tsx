import { describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import ShowResultsSection from '../ShowResultsSection';

vi.mock('@/pages/secretary/ResultsControlPage', () => ({
  default: () => <div data-testid="step-release" />,
}));
vi.mock('@/pages/secretary/ResultsSubmissionPage', () => ({
  default: () => <div data-testid="step-submit" />,
}));
vi.mock('@/pages/secretary/ShowCloseStep', () => ({
  default: () => <div data-testid="step-close" />,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderAt(search: string) {
  return render(
    <Routes>
      <Route
        path="/shows/:id/results"
        element={
          <>
            <ShowResultsSection />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { initialRoute: `/shows/show-1/results${search}` }
  );
}

describe('ShowResultsSection (MYK9-954: Close the show is step 3)', () => {
  it('offers three steps in order', () => {
    renderAt('');

    const steps = screen.getAllByRole('button').map(button => button.textContent);
    expect(steps).toEqual(['Review & release', 'Submit to registry', 'Close the show']);
  });

  it('deep-links to Close the show with ?step=close', async () => {
    renderAt('?step=close');

    expect(await screen.findByTestId('step-close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close the show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches to Close the show and writes the step to the URL', async () => {
    const { user } = renderAt('');
    expect(await screen.findByTestId('step-release')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close the show' }));

    expect(await screen.findByTestId('step-close')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('?step=close');
  });

  it('keeps ?step=submit and falls back to release for an unknown step', async () => {
    const { unmount } = renderAt('?step=submit');
    expect(await screen.findByTestId('step-submit')).toBeInTheDocument();
    unmount();

    renderAt('?step=bogus');
    expect(await screen.findByTestId('step-release')).toBeInTheDocument();
  });
});
