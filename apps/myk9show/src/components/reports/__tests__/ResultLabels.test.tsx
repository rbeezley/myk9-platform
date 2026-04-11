import { render, screen } from '@/test/utils/testUtils';
import { ResultLabels } from '../ResultLabels';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'placement',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  classData: {
    element: 'Container',
    level: 'Novice',
    section: null,
    timeLimitSeconds: null,
    areaCount: null,
    hidesText: null,
    distractionsText: null,
  },
  entries: [
    {
      id: 'e1',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Lab',
      handler: 'Jane Mitchell',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: 90,
      totalFaults: 0,
      finalPlacement: 1,
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Bob Smith',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: 130,
      totalFaults: 5,
      finalPlacement: 9999,
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Carlos Rivera',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: 85,
      totalFaults: 0,
      finalPlacement: 2,
    },
    {
      id: 'e4',
      armband: 104,
      runOrder: 4,
      callName: 'Daisy',
      breed: 'Poodle',
      handler: 'Ana Lopez',
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

describe('ResultLabels', () => {
  it('renders a label for each entry', () => {
    render(<ResultLabels {...baseProps} />);
    const labels = document.querySelectorAll('.result-label');
    expect(labels).toHaveLength(4);
  });

  it('shows armband number on each label', () => {
    render(<ResultLabels {...baseProps} />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.getByText('104')).toBeInTheDocument();
  });

  it('shows call name on each label', () => {
    render(<ResultLabels {...baseProps} />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Daisy')).toBeInTheDocument();
  });

  it('shows placement when scored and placement is valid', () => {
    render(<ResultLabels {...baseProps} />);
    expect(screen.getByText(/Place:\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/Place:\s*2/)).toBeInTheDocument();
  });

  it('shows time formatted as MM:SS.ss', () => {
    render(<ResultLabels {...baseProps} />);
    // 90 seconds = 01:30.00
    expect(screen.getByText(/01:30\.00/)).toBeInTheDocument();
    // 85 seconds = 01:25.00
    expect(screen.getByText(/01:25\.00/)).toBeInTheDocument();
  });

  it('shows blank placement for unscored entry', () => {
    render(<ResultLabels {...baseProps} />);
    // Daisy is not scored — should not render a "Place:" line
    const placeCells = screen.queryAllByText(/Place:/);
    // Scored entries with finalPlacement < 9000: e1 (place 1), e3 (place 2)
    // e2 has placement 9999 (NQ sentinel) — no Place shown; e4 is unscored
    expect(placeCells).toHaveLength(2);
  });

  it('shows handler name on each label', () => {
    render(<ResultLabels {...baseProps} />);
    expect(screen.getByText('Jane Mitchell')).toBeInTheDocument();
  });

  it('sorts by armband when sortOrder=armband', () => {
    render(<ResultLabels {...baseProps} sortOrder="armband" />);
    const armbandEls = document.querySelectorAll('.result-label-armband');
    const armbandValues = Array.from(armbandEls).map(el => el.textContent);
    expect(armbandValues).toEqual(['101', '102', '103', '104']);
  });

  it('shows element and level from classData', () => {
    render(<ResultLabels {...baseProps} />);
    const classLines = screen.getAllByText(/Container Novice/);
    expect(classLines.length).toBeGreaterThanOrEqual(1);
  });

  it('shows trial number in each label', () => {
    render(<ResultLabels {...baseProps} />);
    const trialLines = screen.getAllByText(/Trial 1/);
    expect(trialLines.length).toBeGreaterThanOrEqual(1);
  });
});
