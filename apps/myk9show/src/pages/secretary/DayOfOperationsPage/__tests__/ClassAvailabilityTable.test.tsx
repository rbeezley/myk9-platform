import { render, screen } from '@/test/utils/testUtils';
import { ClassAvailabilityTable } from '../ClassAvailabilityTable';
import type { ClassWithCapacity } from '@/services/database/queries/dayOfOperationsQueries';

const mockClasses: ClassWithCapacity[] = [
  {
    id: 'c1',
    name: 'Novice Agility',
    class_number: '1',
    max_entries: 20,
    trial_id: 't1',
    accepted_count: 10,
    available_spots: 10,
  },
  {
    id: 'c2',
    name: 'Open Agility',
    class_number: '2',
    max_entries: 15,
    trial_id: 't1',
    accepted_count: 15,
    available_spots: 0,
  },
];

describe('ClassAvailabilityTable', () => {
  it('renders sortable column headers', () => {
    render(<ClassAvailabilityTable classes={mockClasses} onAddEntry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /limit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accepted/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /available/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ClassAvailabilityTable classes={mockClasses} onAddEntry={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders class data rows', () => {
    render(<ClassAvailabilityTable classes={mockClasses} onAddEntry={vi.fn()} />);
    expect(screen.getByText('Novice Agility')).toBeInTheDocument();
    expect(screen.getByText('Open Agility')).toBeInTheDocument();
  });

  it('renders Open badge for classes with available spots', () => {
    render(<ClassAvailabilityTable classes={mockClasses} onAddEntry={vi.fn()} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders Full badge for classes at capacity', () => {
    render(<ClassAvailabilityTable classes={mockClasses} onAddEntry={vi.fn()} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('renders Add Day-of Entry button above the table', async () => {
    const onAddEntry = vi.fn();
    const { user } = render(
      <ClassAvailabilityTable classes={mockClasses} onAddEntry={onAddEntry} />
    );
    const addButton = screen.getByRole('button', { name: /add day-of entry/i });
    expect(addButton).toBeInTheDocument();
    await user.click(addButton);
    expect(onAddEntry).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when no classes', () => {
    render(<ClassAvailabilityTable classes={[]} onAddEntry={vi.fn()} />);
    expect(screen.getByText(/no classes found/i)).toBeInTheDocument();
  });
});
