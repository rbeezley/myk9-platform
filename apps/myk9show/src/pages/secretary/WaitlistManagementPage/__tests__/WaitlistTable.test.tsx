import { render, screen } from '@/test/utils/testUtils';
import { findOpenWaitlistSpots, toSpotClass } from '@/features/waiting-for-you';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { WaitlistTable } from '../WaitlistTable';
import { toSpotEntry } from '../spotEntry';
import type { WaitlistEntry, ClassWithWaitlistCount } from '../types';

const mockEntries: WaitlistEntry[] = [
  {
    id: 'w1',
    class_id: 'c1',
    dog_id: 'd1',
    exhibitor_id: 'ex1',
    handler_id: null,
    joined_via: null,
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
    joined_via: null,
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

// 2026-04-06 is a Monday. Two open spots in the judge's day; the class has room too.
const openDay: JudgeDayCapacity = {
  judgeId: 'j1',
  judgeName: 'Pat Donovan',
  showDate: '2026-04-06',
  capacity: 10,
  confirmedCount: 8,
  waitlistCount: 2,
  mailInReserved: 0,
  availableSpots: 2,
  classIds: ['c1'],
  classNames: ['Novice Agility'],
};

/** The page's own calculation, run on the fixture. */
function spotFor(
  cls: ClassWithWaitlistCount,
  day: JudgeDayCapacity | null,
  offers: WaitlistEntry[] = []
) {
  const result = findOpenWaitlistSpots({
    classes: [toSpotClass(cls)],
    waitlist: [...mockEntries, ...offers].map(toSpotEntry),
    judgeDays: day ? [day] : null,
  });
  return result.classes[0];
}

const defaultProps = {
  entries: mockEntries,
  selectedClass: mockClassWithSpots,
  isLoading: false,
  searchActive: false,
  onSetActionDialog: vi.fn(),
};

describe('WaitlistTable', () => {
  it('renders sortable column headers for Position, Dog, and Added', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByRole('button', { name: /position/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /added/i })).toBeInTheDocument();
  });

  // MYK9-795: search moved to the page's shared `ListFilterBar` — this table
  // no longer renders its own search box, it only stays controlled by `searchTerm`/`onSearchChange`.
  it('does not render its own search input', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('renders entry data rows with dog names', () => {
    render(<WaitlistTable {...defaultProps} />);
    // MYK9-90 §5.2 — the call name leads. `dogs.name` is a nullable legacy alias
    // shown only in parentheses when it says something different, so a dog with
    // no legacy name (d2) still renders a name rather than "Unknown Dog".
    expect(screen.getByText('Rexy')).toBeInTheDocument();
    expect(screen.getByText('(Rex)')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('renders the call name when the legacy dogs.name is null', () => {
    render(
      <WaitlistTable
        {...defaultProps}
        entries={[
          {
            ...defaultProps.entries[0]!,
            dog: { id: 'd3', name: null, call_name: 'Tera' },
          },
        ]}
      />
    );
    expect(screen.getByText('Tera')).toBeInTheDocument();
    expect(screen.queryByText('Unknown Dog')).not.toBeInTheDocument();
  });

  it('renders position badges', () => {
    render(<WaitlistTable {...defaultProps} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  describe('spot recommendation', () => {
    it('names the next dog with one main button; other rows keep a quiet Offer', async () => {
      const onSetActionDialog = vi.fn();
      const { user } = render(
        <WaitlistTable
          {...defaultProps}
          spot={spotFor(mockClassWithSpots, openDay)}
          nextEntry={mockEntries[0]!}
          onSetActionDialog={onSetActionDialog}
        />
      );
      expect(screen.getByTestId('waitlist-spot-notice')).toHaveTextContent(
        '2 spots open. Next in line: Rexy (joined Mar 1)'
      );
      const main = screen.getByRole('button', { name: 'Offer spot to Rexy' });
      expect(screen.getAllByRole('button', { name: 'Offer' })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /offer spot$/i })).not.toBeInTheDocument();
      await user.click(main);
      expect(onSetActionDialog).toHaveBeenCalledWith({
        open: true,
        action: 'offer',
        entry: mockEntries[0],
      });
    });

    it('with automatic offering on, recommends no one and every row keeps its own Offer', () => {
      render(
        <WaitlistTable
          {...defaultProps}
          autoOffer
          spot={spotFor(mockClassWithSpots, openDay)}
          nextEntry={mockEntries[0]!}
        />
      );
      expect(screen.getByTestId('waitlist-spot-notice')).toHaveTextContent('2 spots open');
      expect(screen.getByTestId('waitlist-spot-notice')).not.toHaveTextContent('Next in line');
      expect(screen.getAllByRole('button', { name: 'Offer' })).toHaveLength(mockEntries.length);
    });

    it('disables the offers offline', () => {
      render(
        <WaitlistTable
          {...defaultProps}
          offline
          spot={spotFor(mockClassWithSpots, openDay)}
          nextEntry={mockEntries[0]!}
        />
      );
      expect(screen.getByRole('button', { name: 'Offer spot to Rexy' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Offer' })).toBeDisabled();
    });

    it('one open spot with one open offer leaves nothing to offer and no offer button', () => {
      const offered = { ...mockEntries[1]!, id: 'o1', dog_id: 'd9', status: 'offered' };
      const cls = { ...mockClassWithSpots, max_entries: 4, accepted_count: 4 };
      render(
        <WaitlistTable
          {...defaultProps}
          selectedClass={cls}
          spot={spotFor(cls, { ...openDay, availableSpots: 0 }, [offered])}
          nextEntry={mockEntries[0]!}
        />
      );
      expect(screen.getByTestId('waitlist-spot-notice')).toHaveTextContent(
        '1 spot open · 1 offered, waiting for payment · none left to offer'
      );
      expect(screen.queryByRole('button', { name: /^offer/i })).not.toBeInTheDocument();
    });

    it("names the judge's day when the class has room but the day is full", () => {
      render(
        <WaitlistTable
          {...defaultProps}
          spot={spotFor(mockClassWithSpots, { ...openDay, availableSpots: 0 })}
          nextEntry={mockEntries[0]!}
        />
      );
      expect(screen.getByTestId('waitlist-spot-notice')).toHaveTextContent(
        "Novice Agility has room, but Pat Donovan's Monday is full."
      );
      expect(screen.queryByRole('button', { name: /^offer/i })).not.toBeInTheDocument();
    });

    it('offers nothing while the judge-day figures are not known', () => {
      render(
        <WaitlistTable
          {...defaultProps}
          spot={spotFor(mockClassWithSpots, null)}
          nextEntry={mockEntries[0]!}
        />
      );
      expect(screen.queryByRole('button', { name: /^offer/i })).not.toBeInTheDocument();
    });
  });

  it('does not render Offer buttons when no spot has been decided', () => {
    render(<WaitlistTable {...defaultProps} selectedClass={mockClassFull} />);
    expect(screen.queryByRole('button', { name: /^offer/i })).not.toBeInTheDocument();
  });

  it('renders Remove buttons for each entry', () => {
    render(<WaitlistTable {...defaultProps} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(mockEntries.length);
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
