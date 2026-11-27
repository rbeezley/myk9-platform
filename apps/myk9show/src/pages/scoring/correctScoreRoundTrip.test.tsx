// MYK9-2006: "Correct this score" reopens the sheet with exactly what was saved.
// Each test runs the real path: the live sheet submits, the real writer
// (`useOptimisticScoring`) puts the score on the device's row, and that row goes
// back through `toScoringEntry` -> `toScoresheetEntry` into a fresh sheet, which
// is what the judge sees offline after tapping Correct this score.
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getScoresheetComponent,
  type ResolvedClassRules,
  type ScoreData,
  type ScoresheetSportType,
} from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { toExistingScore } from './toExistingScore';
import {
  toOptimisticScorePayload,
  toScoresheetEntry,
  toScoringEntry,
  type ClassInfo,
} from './types';

const device = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));
const savedRowOnDevice = () => device.row as unknown as ReplicatedEntry;

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn(async (_id: string, updates: Record<string, unknown>) => {
      device.row = { ...device.row, ...updates };
      return 'mutation-1';
    }),
  },
}));
vi.mock('@/store/scoringStore', () => ({
  useScoringStore: (selector: (state: { submitScore: () => void }) => unknown) =>
    selector({ submitScore: () => undefined }),
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

const classInfo: ClassInfo = {
  id: 'class-1',
  name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  entryCount: 10,
};

const oneArea: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};
const twoAreas: ResolvedClassRules = { ...oneArea, areaCount: 2, maxTimeSeconds: 360 };

const blankRow: ReplicatedEntry = {
  id: 'entry-1',
  classId: 'class-1',
  dogId: 'dog-1',
  dog_call_name: 'Rex',
  handler: 'Jamie Handler',
  armband: '101',
  status: 'accepted',
};

type Fill = () => void;
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (result: string) => fireEvent.click(screen.getByTestId(`result-${result}`));
const plusFault = () => fireEvent.click(screen.getByRole('button', { name: 'Add a fault' }));

/** Opens `key`'s live sheet on `row`, lets `act` drive it, and returns what it submitted. */
async function runSheet(
  key: ScoresheetSportType,
  rules: ResolvedClassRules,
  row: ReplicatedEntry,
  act_: Fill
): Promise<ScoreData> {
  const Sheet = getScoresheetComponent(key, 'live');
  if (!Sheet) throw new Error(`no sheet for ${key}`);
  const onSubmit = vi.fn<(d: ScoreData) => void>();
  const view = render(
    <Sheet
      entry={toScoresheetEntry(toScoringEntry(row, null, 0), classInfo, key)}
      classInfo={{ element: 'Container', level: 'Novice' }}
      rules={rules}
      onSubmit={onSubmit}
      onBack={() => {}}
    />
  );
  act_();
  fireEvent.click(screen.getByTestId('submit-btn'));
  fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  view.unmount();
  return onSubmit.mock.calls[0]![0];
}

/** The device's row after the real writer saved `data`. */
async function save(data: ScoreData): Promise<ReplicatedEntry> {
  const { result } = renderHook(() => useOptimisticScoring());
  await act(async () => {
    await result.current.submitScoreOptimistically({
      entryId: 'entry-1',
      classId: 'class-1',
      armband: 101,
      className: classInfo.name,
      scoreData: toOptimisticScorePayload(data),
      onSuccess: () => {},
      onError: err => {
        throw err;
      },
    });
  });
  return savedRowOnDevice();
}

interface SheetCase {
  name: string;
  key: ScoresheetSportType;
  rules: ResolvedClassRules;
  timeLabels: string[];
  /** First save: Qualified, times, faults. */
  first: Fill;
  expected: Partial<ScoreData>;
  /** A one-field correction: the faults on AKC and ASCA, a time on UKC and Nationals. */
  correctFaults: Fill;
  expectedAfterFaultFix: Partial<ScoreData>;
}

/** Areas 2 to 5 of the Nationals case; Area 1 is typed first. */
const NATIONALS_FRESH_TIMES: [number, string][] = [
  [2, '1:10.29'],
  [3, '0:10.00'],
  [4, '0:20.00'],
  [5, '0:30.00'],
];

const cases: SheetCase[] = [
  {
    name: 'AKC',
    key: 'AKC_SCENT_WORK',
    rules: twoAreas,
    timeLabels: ['Area 1 time', 'Area 2 time'],
    first: () => {
      type('Area 1 time', '0:04.35');
      type('Area 2 time', '1:10.29');
      pick('Q');
      plusFault();
    },
    expected: { resultText: 'Q', areaTimes: ['0:04.35', '1:10.29'], faultCount: 1 },
    correctFaults: plusFault,
    expectedAfterFaultFix: { areaTimes: ['0:04.35', '1:10.29'], faultCount: 2 },
  },
  {
    name: 'ASCA',
    key: 'ASCA_SCENT_DETECTION',
    rules: twoAreas,
    timeLabels: ['Area 1 time', 'Area 2 time'],
    first: () => {
      type('Area 1 time', '0:04.35');
      type('Area 2 time', '1:10.29');
      pick('Q');
      plusFault();
    },
    expected: { resultText: 'Q', areaTimes: ['0:04.35', '1:10.29'], faultCount: 1 },
    correctFaults: plusFault,
    expectedAfterFaultFix: { areaTimes: ['0:04.35', '1:10.29'], faultCount: 2 },
  },
  {
    name: 'UKC Nosework',
    key: 'UKC_NOSEWORK',
    rules: oneArea,
    timeLabels: ['Recorded time'],
    first: () => {
      type('Recorded time', '0:04.35');
      pick('Q');
      plusFault();
    },
    expected: { resultText: 'Q', areaTimes: ['0:04.35'], faultCount: 1 },
    correctFaults: () => type('Recorded time', '0:05.00'),
    expectedAfterFaultFix: { areaTimes: ['0:05.00'], faultCount: 1 },
  },
  {
    name: 'AKC Nationals',
    key: 'AKC_SCENT_WORK_NATIONAL',
    rules: twoAreas,
    timeLabels: ['Area 1 time'],
    // MYK9-2016: every Nationals class opens with 5 areas, and a fresh Qualified needs a
    // time in each. MYK9-1835: the finish call error costs 5, so 2 x 10 - 5 - 5 = 10 points.
    first: () => {
      type('Area 1 time', '0:04.35');
      NATIONALS_FRESH_TIMES.forEach(([area, time]) => {
        fireEvent.click(screen.getByTestId(`area-tab-${area}`));
        type(`Area ${area} time`, time);
      });
      fireEvent.click(screen.getByTestId('correct-inc'));
      fireEvent.click(screen.getByTestId('correct-inc'));
      fireEvent.click(screen.getByTestId('incorrect-inc'));
      fireEvent.click(screen.getByTestId('fce-inc'));
      pick('Q');
    },
    expected: {
      resultText: 'Q',
      // All five areas come back, Area 5 from its own column (MYK9-2068).
      areaTimes: ['0:04.35', ...NATIONALS_FRESH_TIMES.map(([, time]) => time)],
      correctCount: 2,
      incorrectCount: 1,
      finishCallErrors: 1,
      points: 10,
    },
    // The only change: Area 1's time.
    correctFaults: () => type('Area 1 time', '0:05.00'),
    expectedAfterFaultFix: {
      areaTimes: ['0:05.00', ...NATIONALS_FRESH_TIMES.map(([, time]) => time)],
      correctCount: 2,
      incorrectCount: 1,
      finishCallErrors: 1,
      points: 10,
    },
  },
];

describe.each(cases)('$name: Correct this score (MYK9-2006)', c => {
  beforeEach(() => {
    device.row = { ...blankRow };
  });

  it('reopens with the saved result, every time and the faults, from the device row', async () => {
    const first = await runSheet(c.key, c.rules, blankRow, c.first);
    const saved = await save(first);

    const Sheet = getScoresheetComponent(c.key, 'live')!;
    render(
      <Sheet
        entry={toScoresheetEntry(toScoringEntry(saved, null, 0), classInfo, c.key)}
        classInfo={{ element: 'Container', level: 'Novice' }}
        rules={c.rules}
        onSubmit={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByLabelText(c.timeLabels[0]!)).toHaveValue(c.expected.areaTimes![0]);
  });

  it('saving without changing anything stores the same score', async () => {
    const first = await runSheet(c.key, c.rules, blankRow, c.first);
    const saved = await save(first);
    const again = await runSheet(c.key, c.rules, saved, () => {});
    expect(again).toMatchObject(c.expected);
    const savedAgain = { ...(await save(again)) };
    for (const col of [
      'result_status',
      'search_time_seconds',
      'total_faults',
      'area1_time_seconds',
      'area2_time_seconds',
      'area3_time_seconds',
      'area4_time_seconds',
      'total_correct_finds',
      'total_incorrect_finds',
      'no_finish_count',
      'points_earned',
      'disqualification_reason',
    ] as const) {
      expect(savedAgain[col], col).toEqual(saved[col]);
    }
  });

  it('a one-field correction leaves every other field as saved', async () => {
    const first = await runSheet(c.key, c.rules, blankRow, c.first);
    const saved = await save(first);
    const fixed = await runSheet(c.key, c.rules, saved, c.correctFaults);
    expect(fixed).toMatchObject({ resultText: 'Q', ...c.expectedAfterFaultFix });
  });
});

describe('Correct this score: NQ with its reason (MYK9-2006)', () => {
  beforeEach(() => {
    device.row = { ...blankRow };
  });

  it.each([
    ['AKC_SCENT_WORK', 'Incorrect Call'],
    ['ASCA_SCENT_DETECTION', 'Incorrect Call'],
    ['UKC_NOSEWORK', 'Incorrect Call'], // the rulebook's first NQ fault (MYK9-2008)
  ] as const)('%s keeps the NQ and its reason', async (key, reason) => {
    const label = key === 'UKC_NOSEWORK' ? 'Recorded time' : 'Area 1 time';
    const first = await runSheet(key, oneArea, blankRow, () => {
      type(label, '0:04.35');
      pick('NQ');
    });
    const saved = await save(first);
    const again = await runSheet(key, oneArea, saved, () => {});
    expect(again).toMatchObject({
      resultText: 'NQ',
      nonQualifyingReason: reason,
      areaTimes: ['0:04.35'],
    });
  });
});

describe('AKC Nationals with five areas (MYK9-2006)', () => {
  const fiveAreas: ResolvedClassRules = { ...oneArea, areaCount: 5, maxTimeSeconds: 900 };
  const times = ['0:04.35', '0:10.00', '0:20.00', '0:30.00', '0:40.00'];

  beforeEach(() => {
    device.row = { ...blankRow };
  });

  it('an unchanged save keeps the total that includes the fifth area', async () => {
    const first = await runSheet('AKC_SCENT_WORK_NATIONAL', fiveAreas, blankRow, () => {
      times.forEach((time, i) => {
        fireEvent.click(screen.getByTestId(`area-tab-${i + 1}`));
        type(`Area ${i + 1} time`, time);
      });
      pick('Q');
    });
    const saved = { ...(await save(first)) };
    // 4:04.35 minus nothing: all five times are in the stored total.
    expect(saved.search_time_seconds).toBeCloseTo(104.35, 2);
    // Area 5 has its own column (MYK9-2068), not only a share of the total.
    expect(saved.area5_time_seconds).toBeCloseTo(40, 2);

    const again = await runSheet('AKC_SCENT_WORK_NATIONAL', fiveAreas, saved, () => {});
    expect(again.areaTimes[4]).toBe('0:40.00');
    const savedAgain = await save(again);
    expect(savedAgain.search_time_seconds).toBeCloseTo(104.35, 2);
    for (const col of [
      'area5_time_seconds',
      'area1_time_seconds',
      'area2_time_seconds',
      'area3_time_seconds',
      'area4_time_seconds',
      'result_status',
    ] as const) {
      expect(savedAgain[col], col).toEqual(saved[col]);
    }
  });

  it('changing one area by 3 seconds moves the total by exactly 3 seconds and keeps the fifth', async () => {
    const first = await runSheet('AKC_SCENT_WORK_NATIONAL', fiveAreas, blankRow, () => {
      times.forEach((time, i) => {
        fireEvent.click(screen.getByTestId(`area-tab-${i + 1}`));
        type(`Area ${i + 1} time`, time);
      });
      pick('Q');
    });
    const saved = { ...(await save(first)) };

    const fixed = await runSheet('AKC_SCENT_WORK_NATIONAL', fiveAreas, saved, () => {
      fireEvent.click(screen.getByTestId('area-tab-2'));
      type('Area 2 time', '0:13.00');
    });
    const savedFixed = await save(fixed);
    expect(savedFixed.search_time_seconds).toBeCloseTo(107.35, 2);
    expect(savedFixed.area2_time_seconds).toBeCloseTo(13, 2);
    expect(savedFixed.area5_time_seconds).toBeCloseTo(40, 2);
  });
});

describe('UKC Nosework element time (MYK9-2068)', () => {
  const dual: ResolvedClassRules = { ...oneArea, timerMode: 'dual', maxTimeSeconds: 300 };
  const scored: ScoreData = {
    resultText: 'Q',
    searchTime: '0:04.35',
    areas: { 'area 1': '0:04.35 NOT FOUND INCORRECT' },
    areaTimes: ['0:04.35'],
    correctCount: 0,
    incorrectCount: 0,
    faultCount: 0,
    finishCallErrors: 0,
    points: 0,
    element: '0:09.10',
  };

  beforeEach(() => {
    device.row = { ...blankRow };
  });

  it('stores the element time and Correct this score reads it back', async () => {
    const saved = await save(scored);
    expect(saved.element_time_seconds).toBeCloseTo(9.1, 2);
    expect(toExistingScore(saved)?.element).toBe('0:09.10');
  });

  it('a dog scored without starting the element clock stores a null element time', async () => {
    const first = await runSheet('UKC_NOSEWORK', dual, blankRow, () => {
      type('Recorded time', '0:04.35');
      pick('Q');
    });
    expect(first.element).toBeUndefined();
    const saved = await save(first);
    expect(saved.element_time_seconds).toBeNull();
  });

  it('saving a correction without running the element clock keeps the saved element time', async () => {
    const saved = await save(scored);
    const again = await runSheet('UKC_NOSEWORK', dual, saved, () => {
      // The reopened sheet shows the saved time, not a zeroed clock (live check 2026-11-25).
      expect(screen.getByTestId('element-timer-display')).toHaveTextContent('0:09.10');
    });
    expect(again.element).toBe('0:09.10');
    const savedAgain = await save(again);
    expect(savedAgain.element_time_seconds).toBeCloseTo(9.1, 2);
  });

  it('once the judge starts the clock again, the sheet shows the live clock, not the saved time', async () => {
    const saved = await save(scored);
    await runSheet('UKC_NOSEWORK', dual, saved, () => {
      fireEvent.click(screen.getByTestId('timer-start'));
      expect(screen.getByTestId('element-timer-display')).not.toHaveTextContent('0:09.10');
      pick('Q');
    });
  });
});
