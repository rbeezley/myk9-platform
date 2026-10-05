import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';
import { DogsCompactList } from '../DogsCompactList';

const dogs: Dog[] = [
  {
    id: 'd1',
    name: 'Champion Goldenworth Max',
    callName: 'Max',
    breed: 'Golden Retriever',
    sex: 'male',
    ownerId: 'o1',
    ownerName: 'Jane Doe',
  },
  { id: 'd2', name: 'Maple', breed: 'Beagle', sex: 'female', ownerId: 'o1', ownerName: 'Jane Doe' },
];

function Probe() {
  return <p data-testid="loc">{useLocation().pathname}</p>;
}

describe('DogsCompactList', () => {
  it('lists each dog as a link to its own page, by call name', () => {
    render(<DogsCompactList dogs={dogs} selectedId={undefined} />);
    expect(screen.getByRole('link', { name: /Max/ })).toHaveAttribute('href', '/dogs/d1');
    expect(screen.getByRole('link', { name: /Maple/ })).toHaveAttribute('href', '/dogs/d2');
  });

  it('shows the owner on a roster of everyone’s dogs and drops it on an own-dogs roster', () => {
    const { rerender } = render(<DogsCompactList dogs={dogs} selectedId={undefined} />);
    expect(screen.getAllByText(/Jane Doe/).length).toBeGreaterThan(0);
    rerender(<DogsCompactList dogs={dogs} selectedId={undefined} showOwner={false} />);
    expect(screen.queryByText(/Jane Doe/)).not.toBeInTheDocument();
  });

  it('marks the open dog and announces it', () => {
    render(<DogsCompactList dogs={dogs} selectedId="d2" />);
    expect(screen.getByRole('link', { name: /Maple/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('status')).toHaveTextContent('Showing details for Maple');
  });

  it('opens the next dog on ArrowDown and keeps focus on the list', async () => {
    render(
      <>
        <DogsCompactList dogs={dogs} selectedId="d1" />
        <Probe />
      </>
    );
    screen.getByRole('link', { name: /Max/ }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('loc')).toHaveTextContent('/dogs/d2');
    expect(screen.getByRole('link', { name: /Maple/ })).toHaveFocus();
  });
});
