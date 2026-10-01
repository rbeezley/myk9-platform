import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyShowClassManagementRedirect } from './LegacyClassManagementRedirect';

// MYK9-924: the retired Class Management URL lands on Setup → Classes for the same show.

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}`}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/shows/:id/classes/:trialId" element={<LegacyShowClassManagementRedirect />} />
        <Route path="/shows/:id/setup" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LegacyShowClassManagementRedirect', () => {
  it('sends the old page to Setup → Classes for the same show', () => {
    renderAt('/shows/show-1/classes/trial-1');
    expect(screen.getByTestId('landed')).toHaveTextContent('/shows/show-1/setup?section=classes');
  });

  it('carries the filters that map to a Classes view and drops the rest', () => {
    renderAt('/shows/show-1/classes/trial-1?status=completed&element=Interior&focus=c1');
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/shows/show-1/setup?section=classes&view=completed'
    );
  });

  it('maps the not-started lifecycle filter to the Pending view', () => {
    renderAt('/shows/show-1/classes/trial-1?status=not_started');
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/shows/show-1/setup?section=classes&view=pending'
    );
  });
});
