import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import JudgeCheckInRedirect from '@/routes/JudgeCheckInRedirect';
import { router } from '@/router';

// `/` is HomeRedirect, which sends every signed-in role (judge, steward,
// site admin — everyone the retired route admitted) to its own home.
const REDIRECT_TARGET = '/';

function collectPaths(routes: RouteObject[]): string[] {
  return routes.flatMap(route => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? collectPaths(route.children) : []),
  ]);
}

describe('JudgeCheckInRedirect', () => {
  it('sends the retired mock-data check-in bookmark to the role-aware home, not mock data', async () => {
    render(
      <Routes>
        <Route path="/judge/check-in" element={<JudgeCheckInRedirect />} />
        <Route path={REDIRECT_TARGET} element={<h1>Role home</h1>} />
        <Route path="/judge/dashboard" element={<h1>Judging Assignments</h1>} />
      </Routes>,
      { initialRoute: '/judge/check-in' }
    );

    expect(await screen.findByRole('heading', { name: 'Role home' })).toBeVisible();
    // Not the judge-only dashboard: a steward following the bookmark would be refused there.
    expect(screen.queryByRole('heading', { name: 'Judging Assignments' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Check-In Management/i)).not.toBeInTheDocument();
  });

  it('redirects to a path that is actually registered in the app router', () => {
    expect(collectPaths(router.routes)).toContain(REDIRECT_TARGET);
  });
});
