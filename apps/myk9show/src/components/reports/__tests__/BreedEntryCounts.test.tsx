import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { BreedEntryCounts } from '../BreedEntryCounts';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  showDates: '2026-04-12',
  sortOrder: '',
  entries: [
    {
      id: 'e1',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Labrador Retriever',
      handler: 'Jane',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Rex',
      breed: 'Golden Retriever',
      handler: 'Bob',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Max',
      breed: 'Labrador Retriever',
      handler: 'Carlos',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
    },
    {
      id: 'e4',
      armband: 104,
      runOrder: 4,
      callName: 'Daisy',
      breed: 'Beagle',
      handler: 'Ana',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
    },
  ],
};

describe('BreedEntryCounts', () => {
  it('renders report title', () => {
    render(<BreedEntryCounts {...baseProps} />);
    expect(screen.getByText(/Scent Work Breed Counts/i)).toBeInTheDocument();
  });

  it('lists each breed row', () => {
    render(<BreedEntryCounts {...baseProps} />);
    expect(screen.getByText('Labrador Retriever')).toBeInTheDocument();
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
    expect(screen.getByText('Beagle')).toBeInTheDocument();
  });

  it('shows correct count per breed', () => {
    render(<BreedEntryCounts {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // Header row + 3 breed rows
    const labradorRow = rows.find(r => r.textContent?.includes('Labrador Retriever'));
    expect(labradorRow?.textContent).toContain('2');
    const goldenRow = rows.find(r => r.textContent?.includes('Golden Retriever'));
    expect(goldenRow?.textContent).toContain('1');
  });

  it('sorts breeds alphabetically', () => {
    render(<BreedEntryCounts {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // Skip header row (index 0)
    const breedCells = rows
      .slice(1)
      .map(r => r.querySelector('td')?.textContent)
      .filter(Boolean);
    expect(breedCells[0]).toBe('Beagle');
    expect(breedCells[1]).toBe('Golden Retriever');
    expect(breedCells[2]).toBe('Labrador Retriever');
  });

  it('renders showName and showDates in the header', () => {
    render(<BreedEntryCounts {...baseProps} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
    expect(screen.getByText('2026-04-12')).toBeInTheDocument();
  });

  it('shows total breeds and total entries in footer', () => {
    render(<BreedEntryCounts {...baseProps} />);
    const footer = screen.getByText(/Total Breeds/i);
    expect(footer.textContent).toContain('3');
    expect(footer.textContent).toContain('4');
  });
});
