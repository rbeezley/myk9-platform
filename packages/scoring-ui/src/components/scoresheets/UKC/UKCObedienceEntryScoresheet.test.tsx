import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCObedienceEntryScoresheet } from './UKCObedienceEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '2',
  armband: 15,
  dogName: 'Buddy',
  handlerName: 'Tom Brown',
  className: 'UKC Obedience',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Obedience', level: 'Advanced' };

const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 0,
  hideCount: 0,
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

describe('UKCObedienceEntryScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCObedienceEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('#15')).toBeInTheDocument();
    expect(screen.getByText(/Tom Brown/)).toBeInTheDocument();
  });

  it('renders points input and result select', () => {
    render(<UKCObedienceEntryScoresheet {...defaultProps} />);

    expect(screen.getByTestId('points-input')).toBeInTheDocument();
    expect(screen.getByTestId('result-select')).toBeInTheDocument();
  });

  it('auto-qualifying hint updates when points change', () => {
    render(<UKCObedienceEntryScoresheet {...defaultProps} />);

    // Enter qualifying score
    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '180' } });
    expect(screen.getByTestId('auto-qualify-hint')).toHaveTextContent('Auto-qualifying');

    // Enter non-qualifying score
    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '150' } });
    expect(screen.getByTestId('auto-qualify-hint')).toHaveTextContent('Auto non-qualifying');
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<UKCObedienceEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '175' } });
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
        searchTime: '0.00',
        nonQualifyingReason: 'Below threshold',
        areas: {},
        areaTimes: [],
        correctCount: 0,
        incorrectCount: 0,
        faultCount: 30,
        finishCallErrors: 0,
        points: 170,
      },
    };

    render(<UKCObedienceEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    expect(screen.getByTestId('points-input')).toHaveValue('170');
    expect(screen.getByTestId('result-select')).toHaveValue('NQ');
  });
});
