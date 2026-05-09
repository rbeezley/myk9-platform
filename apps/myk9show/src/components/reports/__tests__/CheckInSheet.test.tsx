import React from 'react';
import { render, screen } from '@testing-library/react';
import { CheckInSheet } from '../CheckInSheet';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';

const entryBuddy: ReportEntry = {
  id: '1',
  armband: 142,
  runOrder: 2,
  callName: 'Buddy',
  breed: 'Golden Retriever',
  handler: 'Sarah Mitchell',
  registrationNumber: null,
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

const entryMax: ReportEntry = {
  id: '2',
  armband: 108,
  runOrder: 1,
  callName: 'Max',
  breed: 'German Shepherd',
  handler: 'Tom Rivera',
  registrationNumber: null,
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

const baseProps: ReportProps = {
  showName: 'Regional Scent Work Championship',
  trial: {
    date: '2026-06-15',
    trialNumber: '1',
    judgeName: 'Janet Hoover',
  },
  classData: {
    element: 'Container',
    level: 'Novice A',
    section: '',
  },
  entries: [entryBuddy, entryMax],
  sortOrder: 'run-order',
  organization: 'AKC',
  activityType: 'Scent Work',
};

describe('CheckInSheet', () => {
  it('renders the title with "Check-in" text', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Check-in');
  });

  it('renders "myK9Show" branding', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('renders trial info: formatted date, judge name, element, level', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('6/15/2026')).toBeInTheDocument();
    expect(screen.getByText('Janet Hoover')).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });

  it('sorts entries by run order by default (runOrder=1 first)', () => {
    render(<CheckInSheet {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is the header, rows[1] is the first data row
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[2]).toHaveTextContent('Buddy');
  });

  it('sorts by armband when sortOrder="armband"', () => {
    render(<CheckInSheet {...baseProps} sortOrder="armband" />);
    const rows = screen.getAllByRole('row');
    // armband 108 (Max) < 142 (Buddy)
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[2]).toHaveTextContent('Buddy');
  });

  it('renders entry count in footer', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.getByText('Class Entries: 2')).toBeInTheDocument();
  });

  it('handles empty entries array (shows 0 count)', () => {
    render(<CheckInSheet {...baseProps} entries={[]} />);
    expect(screen.getByText('Class Entries: 0')).toBeInTheDocument();
  });

  it('renders a dash for entries without armband numbers', () => {
    render(<CheckInSheet {...baseProps} entries={[{ ...entryBuddy, armband: 0 }]} />);

    const rows = screen.getAllByRole('row');
    expect(rows[1].querySelectorAll('td')[1]).toHaveTextContent('-');
  });

  it('shows section when provided and non-empty', () => {
    const propsWithSection: ReportProps = {
      ...baseProps,
      classData: {
        ...baseProps.classData!,
        section: 'A',
      },
    };
    render(<CheckInSheet {...propsWithSection} />);
    expect(screen.getByText('Section:')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('does not show section when section is empty', () => {
    render(<CheckInSheet {...baseProps} />);
    expect(screen.queryByText('Section:')).not.toBeInTheDocument();
  });
});
