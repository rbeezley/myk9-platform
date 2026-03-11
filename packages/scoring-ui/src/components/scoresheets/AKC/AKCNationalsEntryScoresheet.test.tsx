import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCNationalsEntryScoresheet } from './AKCNationalsEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Check: () => <span data-testid="icon-check" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: 1,
  armband: 42,
  dogName: 'Luna',
  handlerName: 'Jane Smith',
  className: 'AKC Nationals',
  element: 'Master',
  level: 'Excellent',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Master', level: 'Excellent' };

const defaultRules: ResolvedClassRules = {
  areaCount: 5,
  timerMode: 'single',
  maxTimeSeconds: 300,
  hideCount: 1,
  hidesKnown: false,
  distractionCount: 0,
};

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('AKCNationalsEntryScoresheet', () => {
  it('renders entry info', () => {
    render(<AKCNationalsEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders 5 area rows with time and alert counter inputs', () => {
    render(<AKCNationalsEntryScoresheet {...defaultProps} />);

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(`Area ${i} time`)).toBeInTheDocument();
    }

    // Each area has +/- buttons for correct and incorrect
    const correctIncreaseBtns = screen.getAllByLabelText(/Increase correct alerts/);
    expect(correctIncreaseBtns).toHaveLength(5);

    const incorrectIncreaseBtns = screen.getAllByLabelText(/Increase incorrect alerts/);
    expect(incorrectIncreaseBtns).toHaveLength(5);
  });

  it('points auto-calculates from alert counters', () => {
    render(<AKCNationalsEntryScoresheet {...defaultProps} />);

    // Increase correct alerts for area 1: +10 pts
    fireEvent.click(screen.getAllByLabelText(/Increase correct alerts/)[0]);
    // Increase incorrect alerts for area 1: -5 pts
    fireEvent.click(screen.getAllByLabelText(/Increase incorrect alerts/)[0]);

    // 10 - 5 = 5 pts
    expect(screen.getByTestId('points-display')).toHaveTextContent('5');
  });

  it('result select includes placement options', () => {
    render(<AKCNationalsEntryScoresheet {...defaultProps} />);

    const select = screen.getByTestId('result-select');
    expect(select.tagName).toBe('SELECT');

    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('Q');
    expect(options).toContain('NQ');
    expect(options).toContain('ABS');
    expect(options).toContain('EX');
    expect(options).toContain('1st');
    expect(options).toContain('2nd');
    expect(options).toContain('3rd');
    expect(options).toContain('4th');
  });

  it('pre-fills from existingScore', () => {
    const entryWithScore: ScoresheetEntry = {
      ...defaultEntry,
      existingScore: {
        resultText: 'Q',
        searchTime: '5:30.00',
        areas: {},
        areaTimes: [],
        correctCount: 3,
        incorrectCount: 1,
        faultCount: 0,
        finishCallErrors: 2,
        points: 25,
      },
    };

    render(<AKCNationalsEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    expect(screen.getByTestId('result-select')).toHaveValue('Q');
    expect(screen.getByTestId('fce-input')).toHaveValue(2);
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<AKCNationalsEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'Q' } });
    fireEvent.click(screen.getByTestId('save-next-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onNext).toHaveBeenCalled();
  });
});
