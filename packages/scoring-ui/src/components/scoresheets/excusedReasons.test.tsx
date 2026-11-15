import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import { excusedReasonsFor } from '../../utils/resultReasons';
import type { LiveScoresheetProps } from '../../types';
import type { ScoreData } from '../../types/scoreData';

// MYK9-2008: UKC and ASCA offer their own Excused reasons, start with none
// chosen and will not save an Excused until the judge picks one; a saved reason
// outside the list still shows as chosen.

function props(existingScore?: ScoreData): LiveScoresheetProps {
  return {
    entry: {
      id: '1',
      armband: 7,
      dogName: 'Rex',
      handlerName: 'Jane Smith',
      className: 'Class',
      element: 'Interior',
      level: 'Novice',
      ...(existingScore ? { existingScore } : {}),
    },
    classInfo: { element: 'Interior', level: 'Novice' },
    rules: {
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 180,
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    },
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };
}

const sheets: {
  name: string;
  Sheet: ComponentType<LiveScoresheetProps>;
  sport: 'UKC_NOSEWORK' | 'ASCA_SCENT_DETECTION';
}[] = [
  { name: 'UKC Nosework', Sheet: UKCNoseworkLiveScoresheet, sport: 'UKC_NOSEWORK' },
  {
    name: 'ASCA Scent Detection',
    Sheet: ASCAScentDetectionLiveScoresheet,
    sport: 'ASCA_SCENT_DETECTION',
  },
];

function savedScore(resultText: string, nonQualifyingReason: string): ScoreData {
  return {
    resultText,
    nonQualifyingReason,
    searchTime: '01:00.00',
    areas: {},
    areaTimes: ['01:00.00'],
    correctCount: 0,
    incorrectCount: 0,
    faultCount: 0,
    finishCallErrors: 0,
    points: 0,
  };
}

async function submit(onSubmit: LiveScoresheetProps['onSubmit']) {
  fireEvent.click(screen.getByTestId('submit-btn'));
  fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return (onSubmit as ReturnType<typeof vi.fn>).mock.calls[0][0];
}

function optionValues(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map(o => (o as HTMLOptionElement).value)
    .filter(Boolean);
}

describe.each(sheets)('$name: Excused reasons', ({ Sheet, sport }) => {
  it("offers the registry's own Excused reasons, with none chosen", () => {
    render(<Sheet {...props()} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    const select = screen.getByTestId('ex-reason-select');
    expect(optionValues(select)).toEqual([...excusedReasonsFor(sport)]);
    expect((select as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'Choose a reason' })).toBeInTheDocument();
  });

  it('will not save an Excused until the judge picks a reason', () => {
    const p = props();
    render(<Sheet {...p} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    expect(screen.getByTestId('submit-btn')).toBeDisabled();
    fireEvent.change(screen.getByTestId('ex-reason-select'), {
      target: { value: excusedReasonsFor(sport)[0] },
    });
    expect(screen.getByTestId('submit-btn')).toBeEnabled();
  });

  it('a saved Excused reason outside the list still shows and saves', async () => {
    const p = props(savedScore('EX', 'Excused'));
    render(<Sheet {...p} />);
    expect((screen.getByTestId('ex-reason-select') as HTMLSelectElement).value).toBe('Excused');
    const data = await submit(p.onSubmit);
    expect([data.resultText, data.nonQualifyingReason]).toEqual(['EX', 'Excused']);
  });

  it('stores the reason the judge picks', async () => {
    const p = props();
    render(<Sheet {...p} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    fireEvent.change(screen.getByTestId('ex-reason-select'), {
      target: { value: 'Poor Sportsmanship' },
    });
    fireEvent.click(screen.getByTestId('result-EX'));
    const data = await submit(p.onSubmit);
    expect([data.resultText, data.nonQualifyingReason]).toEqual(['EX', 'Poor Sportsmanship']);
  });

  it('a saved NQ reason outside the list still shows as chosen', () => {
    render(<Sheet {...props(savedScore('NQ', 'Exceeded Max Time'))} />);
    expect((screen.getByTestId('nq-reason-select') as HTMLSelectElement).value).toBe(
      'Exceeded Max Time'
    );
  });
});
