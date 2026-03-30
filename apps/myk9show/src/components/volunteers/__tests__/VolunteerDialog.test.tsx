import { render, screen } from '@/test/utils/testUtils';
import { VolunteerDialog } from '../VolunteerDialog';
import type { Volunteer } from '@/types/volunteer';

// Mock the query hooks used internally by VolunteerDialog
vi.mock('@/hooks/queries/volunteerQueries', () => ({
  useSearchPeople: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/performance/useTimingHooks', () => ({
  useDebounce: <T,>(value: T) => value,
}));

describe('VolunteerDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    volunteer: null as Volunteer | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Add Volunteer" title when creating', () => {
    render(<VolunteerDialog {...defaultProps} />);
    expect(screen.getByText('Add Volunteer')).toBeInTheDocument();
  });

  it('renders "Edit Volunteer" title when editing', () => {
    const volunteer: Volunteer = {
      id: 'v-1',
      personId: null,
      name: 'Sarah Miller',
      phone: '555-1234',
      notes: 'Morning only',
      isAvailable: true,
      showId: 'show-1',
      createdAt: '',
      updatedAt: '',
    };
    render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByText('Edit Volunteer')).toBeInTheDocument();
  });

  it('pre-fills fields when editing', () => {
    const volunteer: Volunteer = {
      id: 'v-1',
      personId: null,
      name: 'Sarah Miller',
      phone: '555-1234',
      notes: 'Morning only',
      isAvailable: true,
      showId: 'show-1',
      createdAt: '',
      updatedAt: '',
    };
    render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByDisplayValue('Sarah Miller')).toBeInTheDocument();
    expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Morning only')).toBeInTheDocument();
  });

  it('requires name field', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with form data on submit', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.type(screen.getByLabelText(/name/i), 'New Volunteer');
    await user.type(screen.getByLabelText(/phone/i), '555-9999');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Volunteer', phone: '555-9999' })
    );
  });

  it('calls onClose when Cancel is clicked', async () => {
    const { user } = render(<VolunteerDialog {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('shows Delete button only in edit mode', () => {
    const volunteer: Volunteer = {
      id: 'v-1',
      personId: null,
      name: 'Sarah',
      phone: null,
      notes: null,
      isAvailable: true,
      showId: 'show-1',
      createdAt: '',
      updatedAt: '',
    };
    const { rerender } = render(<VolunteerDialog {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();

    rerender(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onDelete when Delete is clicked', async () => {
    const volunteer: Volunteer = {
      id: 'v-1',
      personId: null,
      name: 'Sarah',
      phone: null,
      notes: null,
      isAvailable: true,
      showId: 'show-1',
      createdAt: '',
      updatedAt: '',
    };
    const { user } = render(<VolunteerDialog {...defaultProps} volunteer={volunteer} />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledWith('v-1');
  });
});
