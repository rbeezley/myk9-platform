import React, {
  createContext,
  useContext,
  isValidElement,
  cloneElement,
  createElement,
} from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { AssignVolunteerPopover } from '../AssignVolunteerPopover';
import type { Volunteer } from '@/types/volunteer';

// Mock popover to avoid floating-ui ResizeObserver issues in jsdom
const PopoverContext = createContext<{ open: boolean; onOpenChange: (v: boolean) => void }>({
  open: false,
  onOpenChange: () => {},
});

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => createElement(PopoverContext.Provider, { value: { open, onOpenChange } }, children),
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
    const { onOpenChange, open } = useContext(PopoverContext);
    if (asChild && isValidElement(children)) {
      return cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        onClick: () => onOpenChange(!open),
      });
    }
    return createElement('div', { onClick: () => onOpenChange(!open) }, children);
  },
  PopoverContent: ({ children }: { children: React.ReactNode }) => {
    const { open } = useContext(PopoverContext);
    if (!open) return null;
    return createElement('div', { 'data-testid': 'popover-content' }, children);
  },
}));

const makeVol = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1',
  personId: null,
  name: 'Sarah Miller',
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('AssignVolunteerPopover', () => {
  const volunteers = [
    makeVol({ id: 'v-1', name: 'Sarah Miller' }),
    makeVol({ id: 'v-2', name: 'Mike Roberts', personId: 'p-2' }),
    makeVol({ id: 'v-3', name: 'Tom Kennedy' }),
  ];

  const defaultProps = {
    volunteers,
    excludeIds: [] as string[],
    conflictIds: new Set<string>(),
    onAssign: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with "+" label', () => {
    render(<AssignVolunteerPopover {...defaultProps} />);
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  it('shows volunteer list when trigger is clicked', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    expect(screen.getByText('Sarah Miller')).toBeInTheDocument();
    expect(screen.getByText('Mike Roberts')).toBeInTheDocument();
  });

  it('filters volunteers by search text', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    await user.type(screen.getByPlaceholderText(/search/i), 'Sarah');
    expect(screen.getByText('Sarah Miller')).toBeInTheDocument();
    expect(screen.queryByText('Mike Roberts')).not.toBeInTheDocument();
  });

  it('excludes already-assigned volunteers', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} excludeIds={['v-1']} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    expect(screen.queryByText('Sarah Miller')).not.toBeInTheDocument();
    expect(screen.getByText('Mike Roberts')).toBeInTheDocument();
  });

  describe('empty states say why the list is empty (MYK9-1726)', () => {
    it('points to Add Volunteer when the show has no volunteers yet', async () => {
      const { user } = render(<AssignVolunteerPopover {...defaultProps} volunteers={[]} />);
      await user.click(screen.getByRole('button', { name: /assign/i }));
      expect(screen.getByText(/^No volunteers yet\./)).toHaveTextContent(
        'No volunteers yet. Add people with Add Volunteer at the top of this page.'
      );
    });

    it('says everyone is already assigned when the whole list is excluded', async () => {
      const { user } = render(
        <AssignVolunteerPopover {...defaultProps} excludeIds={['v-1', 'v-2', 'v-3']} />
      );
      await user.click(screen.getByRole('button', { name: /assign/i }));
      expect(screen.getByText('All your volunteers already have this job.')).toBeInTheDocument();
    });

    it('names the search when it matches nobody', async () => {
      const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /assign/i }));
      await user.type(screen.getByPlaceholderText(/search/i), 'Zz');
      expect(screen.getByText('No volunteers match "Zz".')).toBeInTheDocument();
    });
  });

  it('shows conflict indicator for conflicting volunteers', async () => {
    const { user } = render(
      <AssignVolunteerPopover {...defaultProps} conflictIds={new Set(['v-1'])} />
    );
    await user.click(screen.getByRole('button', { name: /assign/i }));
    const item = screen.getByText('Sarah Miller').closest('[data-testid="volunteer-option"]');
    expect(item?.querySelector('[title*="onflict"]')).toBeInTheDocument();
  });

  it('calls onAssign with volunteer id when clicked', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    await user.click(screen.getByText('Sarah Miller'));
    expect(defaultProps.onAssign).toHaveBeenCalledWith('v-1');
  });

  it('shows "(walk-up)" for volunteers without personId', async () => {
    const { user } = render(<AssignVolunteerPopover {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /assign/i }));
    const walkUpLabels = screen.getAllByText(/walk-up/);
    expect(walkUpLabels.length).toBe(2);
  });
});
