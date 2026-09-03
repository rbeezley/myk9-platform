import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import ResultsDashboardRedirect from '@/routes/ResultsDashboardRedirect';

describe('ResultsDashboardRedirect', () => {
  it('sends the legacy dashboard bookmark to the canonical show list', async () => {
    render(
      <Routes>
        <Route path="/results/dashboard" element={<ResultsDashboardRedirect />} />
        <Route path="/shows" element={<h1>Shows</h1>} />
      </Routes>,
      { initialRoute: '/results/dashboard' }
    );

    expect(await screen.findByRole('heading', { name: 'Shows' })).toBeVisible();
  });
});
