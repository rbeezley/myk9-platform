import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCNoseworkEntryScoresheet } from './UKCNoseworkEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Pepper',
  handlerName: 'Alex Johnson',
  className: 'UKC Nosework',
  element: 'Container',
  level: 'Novice',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Container', level: 'Novice' };

const singleRules: ResolvedClassRules = {
  areaCount: 2,
  timerMode: 'single',
  maxTimeSeconds: 120,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

const dualRules: ResolvedClassRules = {
  areaCount: 2,
  timerMode: 'dual',
  maxTimeSeconds: 180,
  hideCount: 3,
  hidesKnown: false,
  distractionCount: 0,
};

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: singleRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('UKCNoseworkEntryScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCNoseworkEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Pepper')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Alex Johnson/)).toBeInTheDocument();
  });

  it('single mode: one search time column per area (no element time column)', () => {
    render(<UKCNoseworkEntryScoresheet {...defaultProps} rules={singleRules} />);

    // Search time inputs present
    expect(screen.getByLabelText('Area 1 search time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 search time')).toBeInTheDocument();
    // No element time column header or inputs
    expect(screen.queryByTestId('element-time-header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Area 1 element time')).not.toBeInTheDocument();
  });

  it('dual mode: two time columns per area (search + element)', () => {
    render(<UKCNoseworkEntryScoresheet {...defaultProps} rules={dualRules} />);

    expect(screen.getByLabelText('Area 1 search time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 1 element time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 search time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 element time')).toBeInTheDocument();
    expect(screen.getByTestId('element-time-header')).toBeInTheDocument();
  });

  it('smart time parsing on blur (type "123", field shows "1:23.00")', () => {
    render(<UKCNoseworkEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByLabelText('Area 1 search time');
    fireEvent.change(timeInput, { target: { value: '123' } });
    fireEvent.blur(timeInput);

    expect(timeInput).toHaveValue('1:23.00');
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<UKCNoseworkEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'Q' } });
    fireEvent.click(screen.getByTestId('save-next-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onNext).toHaveBeenCalled();
  });

  it('pre-fills from existingScore', () => {
    const entryWithScore: ScoresheetEntry = {
      ...defaultEntry,
      existingScore: {
        resultText: 'NQ',
        searchTime: '1:30.00',
        nonQualifyingReason: 'Fault Limit',
        areas: {
          'area 1': '1:30.00 FOUND CORRECT',
          'area 2': '0:00.00 NOT FOUND INCORRECT',
        },
        areaTimes: ['1:30.00', '0:00.00'],
        correctCount: 1,
        incorrectCount: 1,
        faultCount: 3,
        finishCallErrors: 0,
        points: 0,
      },
    };

    render(<UKCNoseworkEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    expect(screen.getByTestId('result-select')).toHaveValue('NQ');
    expect(screen.getByTestId('fault-input')).toHaveValue(3);
  });
});
