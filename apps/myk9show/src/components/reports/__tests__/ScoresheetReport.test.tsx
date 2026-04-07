import { render, screen } from '@testing-library/react';
import { ScoresheetReport } from '../ScoresheetReport';
import type { ReportProps } from '@/lib/reports/types';

const baseEntry = {
  id: '1',
  armband: 101,
  runOrder: 1,
  callName: 'Buddy',
  breed: 'Golden Retriever',
  handler: 'Sarah Mitchell',
  registrationNumber: 'WS12345',
  checkInStatus: null,
  section: null,
  isScored: false,
  resultText: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

const baseClassData: ReportProps['classData'] = {
  element: 'Buried',
  level: 'Novice',
  section: '',
  timeLimitSeconds: 120,
  areaCount: 1,
  hidesText: '1',
  distractionsText: 'None',
};

const baseProps: ReportProps = {
  showName: 'Spring Trial 2026',
  trial: {
    date: '2026-04-12',
    trialNumber: '1',
    judgeName: 'Jane Doe',
  },
  classData: baseClassData,
  entries: [baseEntry],
  sortOrder: 'runOrder',
  organization: 'AKC',
  activityType: 'Scent Work',
};

describe('ScoresheetReport', () => {
  it('renders title with "Scoresheet"', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByRole('heading', { name: /scoresheet/i })).toBeInTheDocument();
  });

  it('renders "myK9Show" branding', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('renders the entry armband number', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders dog call name and handler', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
  });

  it('renders class requirements text with "Hides:" label', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/hides:/i)).toBeInTheDocument();
  });

  it('renders time limit formatted (120 → "2 min")', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('2 min')).toBeInTheDocument();
  });

  it('renders NQ reason checkboxes', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('Incorrect Call')).toBeInTheDocument();
    expect(screen.getByText('Max Time')).toBeInTheDocument();
    expect(screen.getByText('Point to Hide')).toBeInTheDocument();
    expect(screen.getByText('Harsh Correction')).toBeInTheDocument();
    expect(screen.getByText('Significant Disruption')).toBeInTheDocument();
  });

  it('renders EX (excused) reason checkboxes', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('Handler Request')).toBeInTheDocument();
    expect(screen.getByText('Eliminated in Area')).toBeInTheDocument();
    expect(screen.getByText('Out of Control')).toBeInTheDocument();
    expect(screen.getByText('Overly Stressed')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders entry count', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText(/entries:\s*1/i)).toBeInTheDocument();
  });

  it('renders multi-area time boxes with area-label elements when areaCount > 1', () => {
    const multiAreaProps: ReportProps = {
      ...baseProps,
      classData: {
        ...baseClassData,
        areaCount: 3,
        timeLimitSeconds: 120,
        timeLimitArea2Seconds: 90,
        timeLimitArea3Seconds: 60,
      },
    };
    render(<ScoresheetReport {...multiAreaProps} />);
    const areaLabels = document.querySelectorAll('.area-label');
    // 3 areas + Total row = 4 area-label elements
    expect(areaLabels.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.getByText('A3')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('does not render area labels in single-area mode', () => {
    render(<ScoresheetReport {...baseProps} />);
    const areaLabels = document.querySelectorAll('.area-label');
    expect(areaLabels.length).toBe(0);
  });

  it('renders registration number', () => {
    render(<ScoresheetReport {...baseProps} />);
    expect(screen.getByText('WS12345')).toBeInTheDocument();
  });
});
