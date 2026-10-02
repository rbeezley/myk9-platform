import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useUrlTab } from '../useUrlTab';

/**
 * Owner decision 5 (docs/plan-core-object-ui-consistency.md): Back from a tab
 * leaves the page. Club, Trial and the exhibitor Show page all take their tab
 * from this hook, so one test pins the rule for all three.
 */
function TabbedPage() {
  const [tab, setTab] = useUrlTab(['overview', 'entries', 'financials'], 'overview');
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <output data-testid="tab">{tab}</output>
      <button onClick={() => setTab('entries')}>Entries</button>
      <button onClick={() => setTab('financials')}>Financials</button>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

describe('useUrlTab history (MYK9-930, owner decision 5)', () => {
  it('Back after two tab changes leaves the page, not the previous tab', () => {
    render(
      <MemoryRouter initialEntries={['/shows', '/trials/t-1']} initialIndex={1}>
        <TabbedPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Entries'));
    fireEvent.click(screen.getByText('Financials'));
    expect(screen.getByTestId('tab')).toHaveTextContent('financials');
    expect(screen.getByTestId('url')).toHaveTextContent('/trials/t-1?tab=financials');

    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('url')).toHaveTextContent(/^\/shows$/);
  });
});
