import { render, screen, within } from '@/test/utils/testUtils';
import { WaitlistReport } from '../WaitlistReport';
import type { ReportProps, ReportWaitlistRow } from '@/lib/reports/types';

/**
 * MYK9-717: waitlisted dogs live in `waitlist_entries`, never in `entries` —
 * `entries_entry_status_check` forbids 'waitlist' / 'waitlisted'. The report
 * used to filter `entries` for those statuses and so always printed empty.
 * These fixtures therefore carry NO waitlisted `entries` rows at all: the
 * waitlist arrives through the host-resolved `waitlist` prop.
 */
const waitlistRows: ReportWaitlistRow[] = [
  // Deliberately out of position order: the report must sort by position.
  { id: 'w2', classId: 'c1', position: 2, callName: 'Rex', handler: 'Bob Smith' },
  { id: 'w1', classId: 'c1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
  { id: 'w3', classId: 'c2', position: 1, callName: 'Max', handler: 'Carlos Rivera' },
];

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: '',
  entries: [],
  allTrials: [
    { id: 't1', date: '2026-04-12', name: 'Saturday Trial', trialNumber: '1' },
    { id: 't2', date: '2026-04-13', name: 'Sunday Trial', trialNumber: '2' },
  ],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', section: 'A' },
    { id: 'c2', trialId: 't2', element: 'Interior', level: 'Advanced' },
    { id: 'c3', trialId: 't2', element: 'Buried', level: 'Novice' },
  ],
  waitlist: { data: waitlistRows, isLoading: false, isError: false },
};

function classSection(label: RegExp): HTMLElement {
  const header = screen.getByText(label);
  return header.closest('.catalog-class-section') as HTMLElement;
}

describe('WaitlistReport', () => {
  it('renders the report title', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByRole('heading', { name: /AKC Scent Work Waitlist/ })).toBeInTheDocument();
  });

  it('prints every waitlisted dog from waitlist_entries, grouped by trial and class', () => {
    render(<WaitlistReport {...baseProps} />);

    expect(screen.getByText(/Saturday Trial/)).toBeInTheDocument();
    expect(screen.getByText(/Sunday Trial/)).toBeInTheDocument();

    const novice = classSection(/Container Novice A/);
    expect(within(novice).getByText('Buddy')).toBeInTheDocument();
    expect(within(novice).getByText('Jane Mitchell')).toBeInTheDocument();
    expect(within(novice).getByText('Rex')).toBeInTheDocument();
    expect(within(novice).queryByText('Max')).not.toBeInTheDocument();

    const advanced = classSection(/Interior Advanced/);
    expect(within(advanced).getByText('Max')).toBeInTheDocument();
    expect(within(advanced).getByText('Carlos Rivera')).toBeInTheDocument();
  });

  it('lists each class in waitlist position order', () => {
    render(<WaitlistReport {...baseProps} />);
    const rows = within(classSection(/Container Novice A/))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2']);
    expect(rows.map(r => within(r).getAllByRole('cell')[1].textContent)).toEqual(['Buddy', 'Rex']);
  });

  it('omits classes with nobody waiting', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.queryByText(/Buried Novice/)).not.toBeInTheDocument();
  });

  it('drops waitlist rows for classes outside the selected scope', () => {
    render(
      <WaitlistReport
        {...baseProps}
        allTrials={baseProps.allTrials!.slice(0, 1)}
        allClasses={baseProps.allClasses!.slice(0, 1)}
      />
    );
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('shows the empty state when the show has no waitlist', () => {
    render(
      <WaitlistReport {...baseProps} waitlist={{ data: [], isLoading: false, isError: false }} />
    );
    expect(screen.getByText(/No dogs are on a waitlist/i)).toBeInTheDocument();
  });

  it('says the waitlist could not be loaded instead of printing an empty list', () => {
    render(
      <WaitlistReport {...baseProps} waitlist={{ data: [], isLoading: false, isError: true }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load the waitlist/i);
    expect(screen.queryByText(/No dogs are on a waitlist/i)).not.toBeInTheDocument();
  });

  it('prints an em dash when a waitlisted dog has no handler on record', () => {
    render(
      <WaitlistReport
        {...baseProps}
        waitlist={{
          data: [{ id: 'w9', classId: 'c1', position: 1, callName: 'Solo', handler: null }],
          isLoading: false,
          isError: false,
        }}
      />
    );
    const row = within(classSection(/Container Novice A/)).getAllByRole('row')[1];
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('—');
  });
});
