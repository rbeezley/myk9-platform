import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import JudgeCheckInRedirect from '@/routes/JudgeCheckInRedirect';
import { JudgeSidebarRoutes } from '@/routes/judgeRoutes';

const REDIRECT_TARGET = '/judge/dashboard';

function collectRegisteredPaths(element: ReactElement<{ children?: ReactNode }>): string[] {
  return Children.toArray(element.props.children)
    .filter(
      (child): child is ReactElement<{ path?: string }> =>
        isValidElement(child) && child.type === Route
    )
    .map(child => child.props.path)
    .filter((path): path is string => typeof path === 'string');
}

describe('JudgeCheckInRedirect', () => {
  it('sends the retired mock-data check-in bookmark to the judge dashboard, not mock data', async () => {
    render(
      <Routes>
        <Route path="/judge/check-in" element={<JudgeCheckInRedirect />} />
        <Route path={REDIRECT_TARGET} element={<h1>Judging Assignments</h1>} />
      </Routes>,
      { initialRoute: '/judge/check-in' }
    );

    expect(await screen.findByRole('heading', { name: 'Judging Assignments' })).toBeVisible();
    expect(screen.queryByText(/Check-In Management/i)).not.toBeInTheDocument();
  });

  it('redirects to a path that is actually registered in the judge router table', () => {
    const registeredPaths = collectRegisteredPaths(JudgeSidebarRoutes());

    expect(registeredPaths).toContain(REDIRECT_TARGET);
  });
});
