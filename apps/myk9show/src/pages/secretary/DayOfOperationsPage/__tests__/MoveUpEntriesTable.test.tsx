import { render, screen } from '@/test/utils/testUtils';
import { MoveUpEntriesTable } from '../MoveUpEntriesTable';
import type { DayOfOperationEntry } from '../types';

const mockEntries: DayOfOperationEntry[] = [
  {
    id: 'e1',
    class_id: 'c1',
    trial_id: 't1',
    entry_status: 'checked_in',
    jump_height: '8',
    run_order: 1,
    handler: 'Jane Smith',
    armband: '101',
    dog: { id: 'd1', name: 'Rex', call_name: 'Rexy' },
    class: { id: 'c1', name: 'Novice Agility', class_number: '1' },
  },
  {
    id: 'e2',
    class_id: 'c2',
    trial_id: 't1',
    entry_status: 'pending',
    jump_height: '12',
    run_order: 2,
    handler: 'John Doe',
    armband: '102',
    dog: { id: 'd2', name: 'Bella', call_name: null },
    class: { id: 'c2', name: 'Open Agility', class_number: '2' },
  },
];

describe('MoveUpEntriesTable', () => {
  it('renders sortable column headers', () => {
    render(<MoveUpEntriesTable entries={mockEntries} onMoveUp={vi.fn()} />);
    expect(screen.getByRole('button', { name: /armband/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /current class/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<MoveUpEntriesTable entries={mockEntries} onMoveUp={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders entry data rows', () => {
    render(<MoveUpEntriesTable entries={mockEntries} onMoveUp={vi.fn()} />);
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('"Rexy"')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('calls onMoveUp when move up button is clicked', async () => {
    const onMoveUp = vi.fn();
    const { user } = render(<MoveUpEntriesTable entries={mockEntries} onMoveUp={onMoveUp} />);
    const moveUpButtons = screen.getAllByRole('button', { name: /move up/i });
    await user.click(moveUpButtons[0]);
    expect(onMoveUp).toHaveBeenCalledWith(mockEntries[0]);
  });

  it('renders empty state when no entries', () => {
    render(<MoveUpEntriesTable entries={[]} onMoveUp={vi.fn()} />);
    expect(screen.getByText(/no entries available for move-up/i)).toBeInTheDocument();
  });
});
