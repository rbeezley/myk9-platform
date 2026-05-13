import { render, screen } from '@/test/utils/testUtils';
import { ScratchEntriesTable } from '../ScratchEntriesTable';
import type { ScratchableEntry } from '../types';

const mockEntries: ScratchableEntry[] = [
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

describe('ScratchEntriesTable', () => {
  it('renders sortable column headers', () => {
    render(<ScratchEntriesTable entries={mockEntries} onScratch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /armband/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ScratchEntriesTable entries={mockEntries} onScratch={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders entry data rows', () => {
    render(<ScratchEntriesTable entries={mockEntries} onScratch={vi.fn()} />);
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('"Rexy"')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('calls onScratch after inline two-tap confirmation', async () => {
    const onScratch = vi.fn();
    const { user } = render(<ScratchEntriesTable entries={mockEntries} onScratch={onScratch} />);
    const scratchButtons = screen.getAllByRole('button', { name: /^pull$/i });
    await user.click(scratchButtons[0]);
    await user.click(screen.getByRole('button', { name: /confirm pull/i }));
    expect(onScratch).toHaveBeenCalledWith(mockEntries[0]);
  });

  it('renders empty state when no entries', () => {
    render(<ScratchEntriesTable entries={[]} onScratch={vi.fn()} />);
    expect(screen.getByText(/no entries available to pull/i)).toBeInTheDocument();
  });
});
