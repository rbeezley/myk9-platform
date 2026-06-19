import { render, screen } from '@/test/utils/testUtils';
import { TrialRosterView } from '@/components/entries/management/TrialRosterView';
import type { RosterEntry } from '@/components/entries/management/TrialRosterView';

const mockEntries: RosterEntry[] = [
  {
    id: 'e1',
    armband: '101',
    dogName: 'Rex',
    breed: 'German Shepherd',
    handlerName: 'Alice Smith',
    className: 'Novice A',
    classId: 'c1',
    isScored: true,
    checkInStatus: 'checked-in',
  },
  {
    id: 'e2',
    armband: '102',
    dogName: 'Buddy',
    breed: 'Golden Retriever',
    handlerName: 'Bob Jones',
    className: 'Novice A',
    classId: 'c1',
    isScored: false,
    checkInStatus: null,
  },
  {
    id: 'e3',
    armband: null,
    dogName: 'Luna',
    breed: null,
    handlerName: 'Carol White',
    className: 'Open B',
    classId: 'c2',
    isScored: false,
    checkInStatus: 'at-gate',
  },
];

const defaultProps = {
  entries: mockEntries,
  onClassClick: vi.fn(),
};

function setupCsvCapture() {
  let exportedBlob: Blob | undefined;
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const createObjectUrl = vi.fn((blob: Blob) => {
    exportedBlob = blob;
    return 'blob:roster-export';
  });
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createObjectUrl,
    revokeObjectURL: revokeObjectUrl,
  });

  return {
    getCsv: async () => {
      expect(exportedBlob).toBeDefined();
      return readBlobText(exportedBlob!);
    },
    restore: () => {
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

async function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('TrialRosterView', () => {
  it('renders entries with dog name, handler, and class columns', () => {
    render(<TrialRosterView {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Carol White')).toBeInTheDocument();
  });

  it('shows scoring status badges for scored and pending entries', () => {
    render(<TrialRosterView {...defaultProps} />);

    const scoredBadges = screen.getAllByText('Scored');
    const pendingBadges = screen.getAllByText('Pending');

    expect(scoredBadges).toHaveLength(1);
    expect(pendingBadges).toHaveLength(2);
  });

  it('calls onClassClick when class name in header is clicked', async () => {
    const onClassClick = vi.fn();
    const { user } = render(<TrialRosterView entries={mockEntries} onClassClick={onClassClick} />);

    const classHeaders = screen.getAllByRole('button', { name: /Novice A|Open B/ });
    await user.click(classHeaders[0]);

    expect(onClassClick).toHaveBeenCalledWith('c1');
  });

  it('shows empty state when entries array is empty', () => {
    render(<TrialRosterView entries={[]} onClassClick={vi.fn()} />);

    expect(screen.getByText('No entries for this trial.')).toBeInTheDocument();
  });

  it('groups entries by class with group headers', () => {
    render(<TrialRosterView {...defaultProps} />);

    // Should see class group headers
    const noviceHeaders = screen.getAllByText('Novice A');
    const openHeaders = screen.getAllByText('Open B');

    // At least one header per class group
    expect(noviceHeaders.length).toBeGreaterThanOrEqual(1);
    expect(openHeaders.length).toBeGreaterThanOrEqual(1);

    // Should see scoring progress in headers
    expect(screen.getByText('1/2 scored')).toBeInTheDocument();
    expect(screen.getByText('0/1 scored')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    render(<TrialRosterView entries={[]} onClassClick={vi.fn()} isLoading={true} />);

    expect(screen.queryByText('No entries for this trial.')).not.toBeInTheDocument();
  });

  it('renders each class roster with the standard DataTable toolbar', () => {
    render(<TrialRosterView {...defaultProps} />);

    expect(screen.getAllByRole('button', { name: /toggle columns/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /export csv/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /compact density/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /reset table view/i })).toHaveLength(2);
  });

  it('exports roster rows with readable dog, check-in, and scoring values', async () => {
    const csvCapture = setupCsvCapture();
    const { user } = render(<TrialRosterView {...defaultProps} />);

    await user.click(screen.getAllByRole('button', { name: /export csv/i })[0]);

    const csv = await csvCapture.getCsv();
    expect(csv).toContain('Rex (German Shepherd)');
    expect(csv).toContain('Buddy (Golden Retriever)');
    expect(csv).toContain('checked-in');
    expect(csv).toContain('Not checked in');
    expect(csv).toContain('Scored');
    expect(csv).toContain('Pending');
    expect(csv).not.toContain('Luna');

    csvCapture.restore();
  });
});
