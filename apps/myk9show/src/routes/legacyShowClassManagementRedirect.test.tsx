import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyShowClassManagementRedirect } from './LegacyClassManagementRedirect';

// MYK9-924 / MYK9-957: the retired Class Management URL lands on the show home's Select classes.

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}`}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/shows/:id/classes/:trialId" element={<LegacyShowClassManagementRedirect />} />
        <Route path="/shows/:id" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LegacyShowClassManagementRedirect', () => {
  it('sends the old page to Select classes for the same show and trial', () => {
    renderAt('/shows/show-1/classes/trial-1');
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/shows/show-1?select=classes&trialId=trial-1'
    );
  });

  it('carries the trial and focus, and drops element, search and the return link', () => {
    renderAt(
      '/shows/show-1/classes/trial-1?status=completed&element=Interior&search=x&focus=c1&returnTo=%2Fshows%2Fshow-1%2Fshow-day'
    );
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/shows/show-1?select=classes&trialId=trial-1&focus=c1'
    );
  });

  // Select classes is the show home's schedule now (MYK9-1324): only In progress has a schedule
  // filter of its own, so every other old status opens the whole schedule.
  it.each([
    ['not_started', ''],
    ['in_progress', '&filter=in-progress'],
    ['completed', ''],
    ['all', ''],
  ])('maps the %s lifecycle filter to the schedule filter', (status, view) => {
    renderAt(`/shows/show-1/classes/trial-1?status=${status}`);
    expect(screen.getByTestId('landed')).toHaveTextContent(
      `/shows/show-1?select=classes${view}&trialId=trial-1`
    );
  });
});
