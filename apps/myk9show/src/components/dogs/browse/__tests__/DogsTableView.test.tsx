import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsTableView } from '../DogsTableView';

const dogs: Dog[] = [
  { id: '1', name: 'Rex', callName: 'Rex', breed: 'Labrador', sex: 'male', status: 'active' },
  { id: '2', name: 'Bella', callName: 'Bella', breed: 'Poodle', sex: 'female', status: 'active' },
] as unknown as Dog[];

describe('DogsTableView', () => {
  beforeEach(() => localStorage.clear());

  // The page-level ListControls owns the only search box; the table must not
  // render a second, redundant global-filter search of its own.
  it('does not render a built-in search box', () => {
    render(<DogsTableView dogs={dogs} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('still exposes the column-visibility toggle', () => {
    render(<DogsTableView dogs={dogs} />);
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });
});
