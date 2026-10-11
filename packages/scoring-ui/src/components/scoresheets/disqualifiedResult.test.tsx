import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import type { LiveScoresheetProps, ResolvedClassRules } from '../../types';

// MYK9-1011: every scent-work scoresheet offers a Disqualified result, apart from
// Excused, that cannot be saved without a reason and says when the registry allows it.

vi.mock('../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: 0,
    isRunning: false,
    formatTime: () => '0:00.00',
    getRemainingTime: () => '3:00.00',
    getMaxTimeMs: () => 180000,
    getRemainingTimeMs: () => 180000,
    start: vi.fn(),
    pause: vi.fn(() => 0),
    reset: vi.fn(),
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
    getWarningMessage: () => null,
  }),
}));

vi.mock('../../hooks/useElementTimer', () => ({
  useElementTimer: () => ({
    time: 0,
    isRunning: false,
    start: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    formatTime: () => '0:00.00',
  }),
}));

const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

const sheets: {
  name: string;
  Sheet: React.FC<LiveScoresheetProps>;
  helpIncludes: string;
}[] = [
  {
    name: 'AKC Scent Work',
    Sheet: AKCScentWorkLiveScoresheet,
    helpIncludes: 'attacks a person in the search area',
  },
  {
    name: 'AKC Nationals',
    Sheet: AKCNationalsLiveScoresheet,
    helpIncludes: 'attacks a person in the search area',
  },
  {
    name: 'UKC Nosework',
    Sheet: UKCNoseworkLiveScoresheet,
    helpIncludes: 'bites or attempts to bite any person',
  },
  {
    name: 'ASCA Scent Detection',
    Sheet: ASCAScentDetectionLiveScoresheet,
    helpIncludes: 'ASCA disqualification rules',
  },
];

function props(onSubmit = vi.fn()): LiveScoresheetProps {
  return {
    entry: {
      id: '1',
      armband: 7,
      dogName: 'Rex',
      handlerName: 'Jane Smith',
      className: 'Class',
      element: 'Interior',
      level: 'Novice',
    },
    classInfo: { element: 'Interior', level: 'Novice' },
    rules,
    onSubmit,
    onBack: vi.fn(),
  };
}

describe.each(sheets)('$name scoresheet: Disqualified result', ({ Sheet, helpIncludes }) => {
  it('offers DQ as its own choice, separate from Excused', () => {
    render(<Sheet {...props()} />);
    expect(screen.getByTestId('result-DQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
    expect(screen.getByTestId('result-DQ')).not.toBe(screen.getByTestId('result-EX'));
  });

  it('shows no reason box for Excused, and the registry rule for DQ', () => {
    render(<Sheet {...props()} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    expect(screen.queryByTestId('dq-reason-input')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-DQ'));
    expect(screen.getByTestId('dq-reason-input')).toBeInTheDocument();
    expect(screen.getByTestId('dq-help').textContent).toContain(helpIncludes);
  });

  it('blocks Save until a reason is given, then submits resultText DQ with that reason', async () => {
    const onSubmit = vi.fn();
    render(<Sheet {...props(onSubmit)} />);

    fireEvent.click(screen.getByTestId('result-DQ'));
    expect(screen.getByTestId('submit-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('dq-reason-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('submit-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('dq-reason-input'), {
      target: { value: 'Attacked a person in the search area' },
    });
    expect(screen.getByTestId('submit-btn')).toBeEnabled();

    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => expect(screen.getByTestId('confirm-submit-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        resultText: 'DQ',
        nonQualifyingReason: 'Attacked a person in the search area',
        correctCount: 0,
        faultCount: 0,
      })
    );
  });

  it('does not carry an Excused preset reason into a DQ', () => {
    render(<Sheet {...props()} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    fireEvent.click(screen.getByTestId('result-DQ'));
    expect((screen.getByTestId('dq-reason-input') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('submit-btn')).toBeDisabled();
  });
});

describe('Disqualified result: reopening a saved DQ', () => {
  it('pre-selects DQ with the saved reason and allows saving unchanged', () => {
    const base = props();
    render(
      <AKCScentWorkLiveScoresheet
        {...base}
        entry={{
          ...base.entry,
          existingScore: {
            resultText: 'DQ',
            searchTime: '0.00',
            nonQualifyingReason: 'Attacked a person in the search area',
            areas: {},
            areaTimes: [],
            correctCount: 0,
            incorrectCount: 0,
            faultCount: 0,
            finishCallErrors: 0,
            points: 0,
          },
        }}
      />
    );
    expect((screen.getByTestId('dq-reason-input') as HTMLInputElement).value).toBe(
      'Attacked a person in the search area'
    );
    expect(screen.getByTestId('submit-btn')).toBeEnabled();
  });
});
