import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import JudgeCheckInRedirect from '@/routes/JudgeCheckInRedirect';

describe('JudgeCheckInRedirect', () => {
  it('sends the retired mock-data check-in bookmark to the real ringside surface, not mock data', async () => {
    render(
      <Routes>
        <Route path="/judge/check-in" element={<JudgeCheckInRedirect />} />
        <Route path="/at-show" element={<h1>Ringside</h1>} />
      </Routes>,
      { initialRoute: '/judge/check-in' }
    );

    expect(await screen.findByRole('heading', { name: 'Ringside' })).toBeVisible();
    expect(screen.queryByText(/Check-In Management/i)).not.toBeInTheDocument();
  });
});
