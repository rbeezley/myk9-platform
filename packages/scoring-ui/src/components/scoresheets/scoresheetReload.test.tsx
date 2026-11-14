// MYK9-2007: a reload mid-run returns the judge to the same dog with the time
// where the sheet reads it, or tells them plainly what to do.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import type { ResolvedClassRules, ScoresheetClassInfo, ScoresheetEntry } from '../../types';

const entry: ScoresheetEntry = {
  id: 'entry-9',
  armband: 42,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
};
const classInfo: ScoresheetClassInfo = { element: 'Container', level: 'Novice' };
const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** What the page does as it unloads. */
function reloadPage(unmount: () => void) {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  unmount();
}

const SHEETS = [
  {
    name: 'AKC',
    Sheet: AKCScentWorkLiveScoresheet,
    sheetRules: rules,
    timeField: 'Area 1 time',
  },
  {
    name: 'UKC Nosework',
    Sheet: UKCNoseworkLiveScoresheet,
    sheetRules: rules,
    timeField: 'Recorded time',
  },
] as const;

describe.each(SHEETS)(
  '$name sheet after a reload (MYK9-2007)',
  ({ Sheet, sheetRules, timeField }) => {
    beforeEach(() => {
      localStorage.clear();
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderSheet() {
      return render(
        <Sheet
          entry={entry}
          classInfo={classInfo}
          rules={sheetRules}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
        />
      );
    }

    it('a stopped run returns with its time in the time field', () => {
      const first = renderSheet();
      fireEvent.click(screen.getByTestId('timer-start'));
      advance(4350);
      fireEvent.click(screen.getByTestId('timer-stop'));
      expect(screen.getByLabelText(timeField)).toHaveValue('0:04.35');
      reloadPage(first.unmount);

      renderSheet();

      expect(screen.getByLabelText(timeField)).toHaveValue('0:04.35');
      expect(screen.queryByTestId('timer-restore-notice')).not.toBeInTheDocument();
    });

    it('a run caught mid-run keeps counting and says the page reloaded', () => {
      const first = renderSheet();
      fireEvent.click(screen.getByTestId('timer-start'));
      advance(5000);
      reloadPage(first.unmount);
      vi.setSystemTime(Date.now() + 1000);

      renderSheet();

      expect(screen.getByTestId('timer-restore-notice')).toHaveTextContent(
        /restarted during this run/i
      );
      expect(screen.getByTestId('timer-stop')).toBeInTheDocument();
      advance(1000);
      fireEvent.click(screen.getByTestId('timer-stop'));
      const stored = (screen.getByLabelText(timeField) as HTMLInputElement).value;
      expect(stored).toMatch(/^0:0[78]\./);
    });

    it('a run whose time cannot be recovered says what to do', () => {
      const first = renderSheet();
      fireEvent.click(screen.getByTestId('timer-start'));
      advance(5000);
      reloadPage(first.unmount);
      vi.setSystemTime(Date.now() - 3_600_000);

      renderSheet();

      const notice = screen.getByTestId('timer-restore-notice');
      expect(notice).toHaveTextContent(/Type the time/);
      expect(notice).toHaveTextContent(/Use max time/);
      expect(notice).toHaveTextContent(/Reset/);
    });
  }
);

describe('Nationals sheet after a reload (MYK9-2007)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const nationalsRules: ResolvedClassRules = { ...rules, areaCount: 5, maxTimeSeconds: 1500 };

  it('returns on the area that was being timed, with its time in the field', () => {
    const first = render(
      <AKCNationalsLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={nationalsRules}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('area-tab-3'));
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(12_340);
    fireEvent.click(screen.getByTestId('timer-stop'));
    reloadPage(first.unmount);

    render(
      <AKCNationalsLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={nationalsRules}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Area 3 time')).toHaveValue('0:12.34');
  });
});
