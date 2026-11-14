// MYK9-2006: "Correct this score" reopens the sheet with exactly what was saved.
// Each case drives the REAL sheet to save a score, writes it through the real
// scoring hook into the device's own replicated table with no network, reads the
// row back the way the scoresheet page does, and reopens the real sheet on it.
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from '@myk9/replication';
import {
  getScoresheetComponent,
  type ResolvedClassRules,
  type ScoreData,
  type ScoresheetSportType,
} from '@myk9/scoring-ui';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { spyOnWriteAndQueue } from '@/test/utils/spyOnWriteAndQueue';
import {
  toOptimisticScorePayload,
  toScoresheetEntry,
  toScoringEntry,
  type ClassInfo,
} from './types';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

const classInfo: ClassInfo = {
  id: 'class-1',
  name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  entryCount: 10,
};

const singleAreaRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

interface SheetCase {
  key: ScoresheetSportType;
  rules: ResolvedClassRules;
  /** Label of each area's time field, in order. */
  timeLabels: string[];
  /** Nationals shows one area at a time; a tab click opens each. */
  tabTestIds?: string[];
  /** Fills a blank sheet to a Qualified, after the times are typed. */
  chooseQualified: () => void;
  hasFaults: boolean;
}

function typeTime(label: string, value: string, tabTestId?: string) {
  if (tabTestId) fireEvent.click(screen.getByTestId(tabTestId));
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function addFault() {
  fireEvent.click(screen.getByLabelText('Add a fault'));
}

// One fault is within every registry's limit (UKC allows one), so Save stays on.
function chooseQualifiedWithOneFault() {
  fireEvent.click(screen.getByTestId('result-Q'));
  addFault();
}

const CASES: SheetCase[] = [
  {
    key: 'AKC_SCENT_WORK',
    rules: singleAreaRules,
    timeLabels: ['Area 1 time'],
    hasFaults: true,
    chooseQualified: chooseQualifiedWithOneFault,
  },
  {
    key: 'AKC_SCENT_WORK',
    rules: { ...singleAreaRules, areaCount: 2, maxTimeSeconds: 180 },
    timeLabels: ['Area 1 time', 'Area 2 time'],
    hasFaults: true,
    chooseQualified: chooseQualifiedWithOneFault,
  },
  {
    key: 'ASCA_SCENT_DETECTION',
    rules: singleAreaRules,
    timeLabels: ['Area 1 time'],
    hasFaults: true,
    chooseQualified: chooseQualifiedWithOneFault,
  },
  {
    key: 'UKC_NOSEWORK',
    rules: singleAreaRules,
    timeLabels: ['Recorded time'],
    hasFaults: true,
    chooseQualified: chooseQualifiedWithOneFault,
  },
  {
    key: 'AKC_SCENT_WORK_NATIONAL',
    rules: { ...singleAreaRules, areaCount: 5, maxTimeSeconds: 1500 },
    timeLabels: ['Area 1 time', 'Area 2 time', 'Area 3 time', 'Area 4 time', 'Area 5 time'],
    tabTestIds: ['area-tab-1', 'area-tab-2', 'area-tab-3', 'area-tab-4', 'area-tab-5'],
    hasFaults: false,
    chooseQualified: () => {
      fireEvent.click(screen.getByTestId('area-tab-1'));
      fireEvent.click(screen.getByTestId('correct-inc'));
      fireEvent.click(screen.getByTestId('correct-inc'));
      fireEvent.click(screen.getByTestId('incorrect-inc'));
      fireEvent.click(screen.getByTestId('fce-inc'));
      fireEvent.click(screen.getByTestId('result-Q'));
    },
  },
];

const TIMES = ['0:04.35', '0:10.50', '0:20.00', '0:30.25', '0:45.10'];

function timesFor(c: SheetCase): string[] {
  return TIMES.slice(0, c.timeLabels.length);
}

async function submitVisibleSheet(onSubmit: ReturnType<typeof vi.fn>): Promise<ScoreData> {
  fireEvent.click(screen.getByTestId('submit-btn'));
  fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]![0] as ScoreData;
}

function renderSheet(c: SheetCase, entry: ReturnType<typeof toScoresheetEntry>) {
  const Sheet = getScoresheetComponent(c.key, 'live');
  if (!Sheet) throw new Error(`no sheet for ${c.key}`);
  const onSubmit = vi.fn();
  const onDirtyChange = vi.fn();
  const page = render(
    <Sheet
      entry={entry}
      classInfo={{ element: 'Container', level: 'Novice' }}
      rules={c.rules}
      onSubmit={onSubmit}
      onBack={() => {}}
      onDirtyChange={onDirtyChange}
    />
  );
  return { onSubmit, page, onDirtyChange };
}

/** The device write the at-show sheet makes, with no network. */
async function saveOnDevice(scoreData: ScoreData) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  const { result } = renderHook(() => useOptimisticScoring());
  await act(async () => {
    await result.current.submitScoreOptimistically({
      entryId: 'entry-1',
      classId: 'class-1',
      armband: 101,
      className: classInfo.name,
      scoreData: toOptimisticScorePayload(scoreData),
    });
  });
}

/** The page's own reload: the device's row, through the same mapping. */
async function readSheetEntry(key: ScoresheetSportType) {
  const rows = await replicatedEntriesTable.getEntriesByClass('class-1');
  return toScoresheetEntry(toScoringEntry(rows[0]!, null, 0), classInfo, key);
}

/** Every field a save stores. */
function stored(score: ScoreData) {
  const payload = toOptimisticScorePayload(score);
  return {
    resultText: payload.resultText,
    searchTime: payload.searchTime,
    areaTimes: payload.areaTimes,
    faultCount: payload.faultCount,
    correctCount: payload.correctCount,
    incorrectCount: payload.incorrectCount,
    finishCallErrors: payload.finishCallErrors,
    points: payload.points,
    nonQualifyingReason: payload.nonQualifyingReason,
  };
}

async function saveFreshQualified(c: SheetCase): Promise<ScoreData> {
  const { onSubmit, page } = renderSheet(c, await readSheetEntry(c.key));
  timesFor(c).forEach((time, i) => typeTime(c.timeLabels[i]!, time, c.tabTestIds?.[i]));
  c.chooseQualified();
  const first = await submitVisibleSheet(onSubmit);
  page.unmount();
  await saveOnDevice(first);
  return first;
}

describe('Correct this score reopens what was saved (MYK9-2006)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
    spyOnWriteAndQueue(replicatedEntriesTable).queue.mockResolvedValue('mutation-1');
    await replicatedEntriesTable.set(
      'entry-1',
      {
        id: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        armband: '101',
        status: 'registered',
        dog_call_name: 'Rex',
      },
      false,
      undefined,
      undefined,
      { allowColdInsert: 'test fixture standing in for the sync download' }
    );
  });

  describe.each(CASES)('$key ($timeLabels.length areas)', c => {
    it('shows the saved result, every area time and the faults, offline', async () => {
      const first = await saveFreshQualified(c);

      const reopened = await readSheetEntry(c.key);
      expect(reopened.existingScore).toBeDefined();
      const { onSubmit, onDirtyChange } = renderSheet(c, reopened);

      // Looking at a saved score is not an edit: leaving it asks nothing.
      expect(onDirtyChange).not.toHaveBeenLastCalledWith(true);

      timesFor(c).forEach((time, i) => {
        if (c.tabTestIds) fireEvent.click(screen.getByTestId(c.tabTestIds[i]!));
        expect(screen.getByLabelText(c.timeLabels[i]!)).toHaveValue(time);
      });
      if (c.hasFaults) expect(screen.getByText('Faults').parentElement).toHaveTextContent('1');

      // Saving without changing anything stores the same score.
      const second = await submitVisibleSheet(onSubmit);
      expect(stored(second)).toEqual(stored(first));
    });

    it('a correction of the time alone leaves every other saved value', async () => {
      const first = await saveFreshQualified(c);
      const { onSubmit } = renderSheet(c, await readSheetEntry(c.key));

      typeTime(c.timeLabels[0]!, '0:05.00', c.tabTestIds?.[0]);
      const second = await submitVisibleSheet(onSubmit);

      const expectedTimes = [...timesFor(c)];
      expectedTimes[0] = '0:05.00';
      expect(second.areaTimes).toEqual(expectedTimes);
      expect({ ...stored(second), areaTimes: [], searchTime: '' }).toEqual({
        ...stored(first),
        areaTimes: [],
        searchTime: '',
      });
    });

    if (c.hasFaults) {
      it('a correction of the faults alone leaves the time and result as saved', async () => {
        const first = await saveFreshQualified(c);
        const { onSubmit } = renderSheet(c, await readSheetEntry(c.key));

        fireEvent.click(screen.getByLabelText('Remove a fault'));
        const second = await submitVisibleSheet(onSubmit);

        expect(stored(second)).toEqual({ ...stored(first), faultCount: 0 });
      });
    }
  });
});
