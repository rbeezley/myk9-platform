import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
import { AKCFastCatLiveScoresheet } from './AKC/AKCFastCatLiveScoresheet';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import { UKCRallyLiveScoresheet } from './UKC/UKCRallyLiveScoresheet';
import { UKCObedienceLiveScoresheet } from './UKC/UKCObedienceLiveScoresheet';
import type { LiveScoresheetProps, ResolvedClassRules } from '../../types';

// MYK9-1501: the Score Confirmation is the read-back the judge copies onto the paper
// sheet. Every sport shows the result in words, any recorded NQ / Excused / DQ reason,
// and (multi-area classes) each area's time plus the total.

const rules = (areaCount = 1): ResolvedClassRules => ({
  areaCount,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
});

function props(areaCount = 1): LiveScoresheetProps {
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
    rules: rules(areaCount),
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };
}

type Sheet = ComponentType<LiveScoresheetProps>;

interface Sport {
  name: string;
  Sheet: Sheet;
  /** Steps a sheet needs before Save works (Obedience wants points). */
  prepare?: () => void;
  hasDq: boolean;
  /** How the sheet records an NQ reason, when it has one. */
  nqReason?: () => void;
  /** Whether choosing Excused records a reason by itself. */
  excusedReason: boolean;
}

const sports: Sport[] = [
  {
    name: 'AKC Scent Work',
    Sheet: AKCScentWorkLiveScoresheet,
    hasDq: true,
    nqReason: () => undefined, // preset "Incorrect Call"
    excusedReason: true,
  },
  {
    name: 'ASCA Scent Detection',
    Sheet: ASCAScentDetectionLiveScoresheet,
    hasDq: true,
    nqReason: () => undefined,
    excusedReason: true,
  },
  {
    name: 'UKC Nosework',
    Sheet: UKCNoseworkLiveScoresheet,
    hasDq: true,
    nqReason: () => undefined,
    excusedReason: true,
  },
  { name: 'AKC Nationals', Sheet: AKCNationalsLiveScoresheet, hasDq: true, excusedReason: false },
  { name: 'AKC FastCAT', Sheet: AKCFastCatLiveScoresheet, hasDq: true, excusedReason: false },
  {
    name: 'UKC Rally',
    Sheet: UKCRallyLiveScoresheet,
    hasDq: false,
    nqReason: () =>
      fireEvent.change(screen.getByTestId('nq-reason-input'), {
        target: { value: 'Wrong course' },
      }),
    excusedReason: false,
  },
  {
    name: 'UKC Obedience',
    Sheet: UKCObedienceLiveScoresheet,
    prepare: () =>
      fireEvent.change(screen.getByTestId('points-input'), { target: { value: '150' } }),
    hasDq: true,
    nqReason: () =>
      fireEvent.change(screen.getByTestId('nq-reason-input'), { target: { value: 'Broke stay' } }),
    excusedReason: true,
  },
];

function openConfirmation(sport: Sport, result: string, areaCount = 1) {
  const { Sheet } = sport;
  const utils = render(<Sheet {...props(areaCount)} />);
  sport.prepare?.();
  fireEvent.click(screen.getByTestId(`result-${result}`));
  return utils;
}

function save() {
  fireEvent.click(screen.getByTestId('submit-btn'));
  return screen.getByTestId('confirmation-dialog');
}

describe.each(sports)('$name: Score Confirmation read-back', sport => {
  it('shows the result in words, never the code', () => {
    openConfirmation(sport, 'Q');
    const dialog = save();
    expect(within(dialog).getByText('Result').nextElementSibling?.textContent).toBe('Qualified');
  });

  it('shows the dog, so the judge can match it to the paper sheet', () => {
    openConfirmation(sport, 'Q');
    const dialog = save();
    expect(within(dialog).getByText('Rex')).toBeInTheDocument();
    expect(within(dialog).getByText('Handler: Jane Smith')).toBeInTheDocument();
    expect(within(dialog).getByText('7')).toBeInTheDocument();
  });

  it('is never skipped: Save opens it and nothing is submitted until Confirm', () => {
    const p = props();
    const { Sheet } = sport;
    render(<Sheet {...p} />);
    sport.prepare?.();
    fireEvent.click(screen.getByTestId('result-Q'));
    save();
    expect(p.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-submit-btn')).toBeInTheDocument();
  });

  if (sport.hasDq) {
    it('shows the DQ reason that was recorded, with DQ as the result', () => {
      openConfirmation(sport, 'DQ');
      fireEvent.change(screen.getByTestId('dq-reason-input'), {
        target: { value: 'Attacked a person' },
      });
      const dialog = save();
      expect(within(dialog).getByText('Result').nextElementSibling?.textContent).toBe('DQ');
      expect(within(dialog).getByText('DQ Reason').nextElementSibling?.textContent).toBe(
        'Attacked a person'
      );
    });
  }

  if (sport.nqReason) {
    it('shows the NQ reason that was recorded', () => {
      openConfirmation(sport, 'NQ');
      sport.nqReason?.();
      const dialog = save();
      expect(within(dialog).getByText('Result').nextElementSibling?.textContent).toBe('NQ');
      const reason = within(dialog).getByText('NQ Reason').nextElementSibling?.textContent;
      expect(reason?.length).toBeGreaterThan(0);
    });
  }

  if (sport.excusedReason) {
    it('shows the Excused reason, in words', () => {
      openConfirmation(sport, 'EX');
      if (sport.name === 'UKC Obedience') {
        fireEvent.change(screen.getByTestId('nq-reason-input'), {
          target: { value: 'Handler request' },
        });
      }
      const dialog = save();
      expect(within(dialog).getByText('Result').nextElementSibling?.textContent).toBe('Excused');
      expect(within(dialog).getByText('Excused Reason')).toBeInTheDocument();
    });
  }
});

describe('Absent reads as a word on the sheets that offer it', () => {
  it.each([
    ['AKC Scent Work', AKCScentWorkLiveScoresheet],
    ['ASCA Scent Detection', ASCAScentDetectionLiveScoresheet],
    ['UKC Nosework', UKCNoseworkLiveScoresheet],
    ['AKC Nationals', AKCNationalsLiveScoresheet],
  ] as [string, Sheet][])('%s', (_name, Sheet) => {
    render(<Sheet {...props()} />);
    fireEvent.click(screen.getByTestId('result-ABS'));
    const dialog = save();
    expect(within(dialog).getByText('Result').nextElementSibling?.textContent).toBe('Absent');
  });
});

describe.each([
  ['AKC Scent Work', AKCScentWorkLiveScoresheet],
  ['ASCA Scent Detection', ASCAScentDetectionLiveScoresheet],
] as [string, Sheet][])('%s: per-area times', (_name, Sheet) => {
  it('lists each area time and the total on a multi-area class', () => {
    render(<Sheet {...props(2)} />);
    fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '1:00.00' } });
    fireEvent.change(screen.getByLabelText('Area 2 time'), { target: { value: '2:00.00' } });
    fireEvent.click(screen.getByTestId('result-Q'));
    const dialog = save();
    expect(within(dialog).getByText('Area 1').nextElementSibling?.textContent).toBe('1:00.00');
    expect(within(dialog).getByText('Area 2').nextElementSibling?.textContent).toBe('2:00.00');
    expect(within(dialog).getByText('Total time').nextElementSibling?.textContent).toBe('3:00.00');
  });

  it('keeps a single-area class to one Time row', () => {
    render(<Sheet {...props(1)} />);
    fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '1:30.00' } });
    fireEvent.click(screen.getByTestId('result-Q'));
    const dialog = save();
    expect(within(dialog).getByText('Time').nextElementSibling?.textContent).toBe('1:30.00');
    expect(within(dialog).queryByText('Total time')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Area 1')).not.toBeInTheDocument();
  });
});

describe('UKC Nosework: one search area', () => {
  it('reads the search time as a single row, never a per-area list', () => {
    render(<UKCNoseworkLiveScoresheet {...props(3)} />);
    fireEvent.change(screen.getByTestId('ukc-recorded-time'), { target: { value: '1:10.00' } });
    fireEvent.click(screen.getByTestId('result-Q'));
    const dialog = save();
    expect(within(dialog).getByText('Search Time').nextElementSibling?.textContent).toBe('1:10.00');
    expect(within(dialog).queryByText('Total time')).not.toBeInTheDocument();
  });
});
