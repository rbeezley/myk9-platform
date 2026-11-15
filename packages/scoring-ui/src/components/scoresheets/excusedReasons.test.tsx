import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import { excusedReasonsFor } from '../../utils/resultReasons';
import type { LiveScoresheetProps } from '../../types';
import type { ScoreData } from '../../types/scoreData';

// MYK9-2008: UKC and ASCA offer their own Excused reasons, and a saved reason
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
  starts: string;
}[] = [
  {
    name: 'UKC Nosework',
    Sheet: UKCNoseworkLiveScoresheet,
    sport: 'UKC_NOSEWORK',
    starts: 'Dog Eliminated in Area',
  },
  {
    name: 'ASCA Scent Detection',
    Sheet: ASCAScentDetectionLiveScoresheet,
    sport: 'ASCA_SCENT_DETECTION',
    starts: '',
  },
];

function optionValues(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map(o => (o as HTMLOptionElement).value)
    .filter(Boolean);
}

describe.each(sheets)('$name: Excused reasons', ({ Sheet, sport, starts }) => {
  it("offers the registry's own Excused reasons", () => {
    render(<Sheet {...props()} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    const select = screen.getByTestId('ex-reason-select');
    expect(optionValues(select)).toEqual([...excusedReasonsFor(sport)]);
    expect((select as HTMLSelectElement).value).toBe(starts);
  });

  it('stores the reason the judge picks', async () => {
    const p = props();
    render(<Sheet {...p} />);
    fireEvent.click(screen.getByTestId('result-EX'));
    fireEvent.change(screen.getByTestId('ex-reason-select'), {
      target: { value: 'Poor Sportsmanship' },
    });
    fireEvent.click(screen.getByTestId('result-EX'));
    fireEvent.click(screen.getByTestId('submit-btn'));
    fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
    await vi.waitFor(() => expect(p.onSubmit).toHaveBeenCalledTimes(1));
    const data = (p.onSubmit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect([data.resultText, data.nonQualifyingReason]).toEqual(['EX', 'Poor Sportsmanship']);
  });

  it('a saved NQ reason outside the list still shows as chosen', () => {
    const saved: ScoreData = {
      resultText: 'NQ',
      nonQualifyingReason: 'Handler Error',
      searchTime: '01:00.00',
      areas: {},
      areaTimes: ['01:00.00'],
      correctCount: 0,
      incorrectCount: 0,
      faultCount: 0,
      finishCallErrors: 0,
      points: 0,
    };
    render(<Sheet {...props(saved)} />);
    expect((screen.getByTestId('nq-reason-select') as HTMLSelectElement).value).toBe(
      'Handler Error'
    );
  });
});
