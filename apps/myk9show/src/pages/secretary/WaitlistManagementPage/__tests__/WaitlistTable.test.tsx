import { render, screen } from '@/test/utils/testUtils';
import { WaitlistTable } from '../WaitlistTable';
import type { WaitlistEntry, ClassWithWaitlistCount } from '../types';

const mockEntries: WaitlistEntry[] = [
  {
    id: 'w1',
    class_id: 'c1',
    dog_id: 'd1',
    exhibitor_id: 'ex1',
    handler_id: null,
    position: 1,
    status: 'waiting',
    offered_at: null,
    offer_expires_at: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    dog: { id: 'd1', name: 'Rex', call_name: 'Rexy' },
    class: { id: 'c1', name: 'Novice Agility', class_number: '1', max_entries: 5 },
  },
  {
    id: 'w2',
    class_id: 'c1',
    dog_id: 'd2',
    exhibitor_id: 'ex2',
    handler_id: null,
    position: 2,
    status: 'waiting',
    offered_at: null,
    offer_expires_at: null,
    created_at: '2026-03-01T11:00:00Z',
    updated_at: '2026-03-01T11:00:00Z',
    dog: { id: 'd2', name: 'Bella', call_name: null },
    class: { id: 'c1', name: 'Novice Agility', class_number: '1', max_entries: 5 },
  },
];

const mockClassWithSpots: ClassWithWaitlistCount = {
  id: 'c1',
  name: 'Novice Agility',
  class_number: '1',
  max_entries: 5,
  trial_id: 't1',
  trial: { id: 't1', name: 'Trial 1', date: '2026-04-01' },
  accepted_count: 3,
  waitlist_count: 2,
};

const mockClassFull: ClassWithWaitlistCount = {
  ...mockClassWithSpots,
  accepted_count: 5,
};

const defaultProps = {
  entries: mockEntries,
  selectedClass: mockClassWithSpots,
  isLoading: false,
  searchTerm: '',
  onSearchChange: vi.fn(),
  onSetActionDialog: vi.fn(),
};

describe('WaitlistTable', () => {
  it('renders sortable column headers for Position, Dog, and Added', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByRole('button', { name: /position/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /added/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders entry data rows with dog names', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('renders position badges', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('renders Offer Spot buttons when class has available spots', () => {
    render(<WaitlistTable {...defaultProps} selectedClass={mockClassWithSpots} />);
    const offerButtons = screen.getAllByRole('button', { name: /offer spot/i });
    expect(offerButtons.length).toBeGreaterThan(0);
  });

  it('does not render Offer Spot buttons when class is full', () => {
    render(<WaitlistTable {...defaultProps} selectedClass={mockClassFull} />);
    expect(screen.queryByRole('button', { name: /offer spot/i })).not.toBeInTheDocument();
  });

  it('renders Remove buttons for each entry', () => {
    render(<WaitlistTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(mockEntries.length);
  });

  it('calls onSetActionDialog with offer action when Offer Spot is clicked', async () => {
    const onSetActionDialog = vi.fn();
    const { user } = render(
      <WaitlistTable {...defaultProps} onSetActionDialog={onSetActionDialog} />
    );
    const offerButtons = screen.getAllByRole('button', { name: /offer spot/i });
    await user.click(offerButtons[0]);
    expect(onSetActionDialog).toHaveBeenCalledWith({
      open: true,
      action: 'offer',
      entry: mockEntries[0],
    });
  });

  it('calls onSetActionDialog with remove action when Remove is clicked', async () => {
    const onSetActionDialog = vi.fn();
    const { user } = render(
      <WaitlistTable {...defaultProps} onSetActionDialog={onSetActionDialog} />
    );
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]);
    expect(onSetActionDialog).toHaveBeenCalledWith({
      open: true,
      action: 'remove',
      entry: mockEntries[0],
    });
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<WaitlistTable {...defaultProps} isLoading={true} />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders empty state when no entries', () => {
    render(<WaitlistTable {...defaultProps} entries={[]} />);
    expect(screen.getByText(/no entries on waitlist/i)).toBeInTheDocument();
  });
});
