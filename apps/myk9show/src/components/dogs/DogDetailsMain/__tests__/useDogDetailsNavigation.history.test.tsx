import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useDogDetailsNavigation } from '../useDogDetailsNavigation';

/**
 * Owner decision 5 (docs/plan-core-object-ui-consistency.md, audit M14): Back
 * from a section leaves the dog page. Section and view changes replace history.
 */
function DogSections() {
  const { state, setSection, setView } = useDogDetailsNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <output data-testid="section">{state.section}</output>
      <button onClick={() => setSection('career')}>Career</button>
      <button onClick={() => setSection('records')}>Records</button>
      <button onClick={() => setView('titles')}>Titles</button>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

function renderAtDog() {
  return render(
    <MemoryRouter initialEntries={['/dogs', '/dogs/dog-1']} initialIndex={1}>
      <DogSections />
    </MemoryRouter>
  );
}

describe('useDogDetailsNavigation history (MYK9-930, owner decision 5)', () => {
  it('Back after two section changes leaves the dog page', () => {
    renderAtDog();

    fireEvent.click(screen.getByText('Career'));
    fireEvent.click(screen.getByText('Records'));
    expect(screen.getByTestId('section')).toHaveTextContent('records');

    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('url')).toHaveTextContent(/^\/dogs$/);
  });

  it('Back after opening a secondary view leaves the dog page too', () => {
    renderAtDog();

    fireEvent.click(screen.getByText('Career'));
    fireEvent.click(screen.getByText('Titles'));
    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('url')).toHaveTextContent(/^\/dogs$/);
  });
});
