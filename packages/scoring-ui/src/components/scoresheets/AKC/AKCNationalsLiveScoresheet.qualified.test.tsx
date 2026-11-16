/**
 * MYK9-2019 and MYK9-1835: the Nationals sheet checks a Qualified against the area
 * limit (class time / areas), and finish call errors cost points. Rules are shaped
 * like production, where areaMaxTimeSeconds holds the whole class time per area.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AKCNationalsLiveScoresheet } from './AKCNationalsLiveScoresheet';
import { NATIONALS_AREA_COUNT } from './nationalsAlerts';
import { buildResolvedClassRules } from '../../../utils/buildResolvedClassRules';

const timer = vi.hoisted(() => ({ maxTimes: [] as Array<string | undefined> }));

vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: (options: { maxTime?: string }) => {
    timer.maxTimes.push(options.maxTime);
    return {
      time: 0,
      subscribeTime: () => () => undefined,
      getTimeMs: () => 0,
      isRunning: false,
      formatTime: () => '0:00.00',
      start: vi.fn(),
      pause: vi.fn(() => 0),
      reset: vi.fn(),
      getMaxTimeMs: () => 60000,
      shouldShow30SecondWarning: () => false,
      isTimeExpired: () => false,
      getWarningMessage: () => null,
    };
  },
}));

// Production shape: five areas of a 5:00 class, every areaMaxTimeSeconds entry 300.
const productionRules = buildResolvedClassRules({ area_count: 5, time_limit_seconds: 300 });

function renderSheet(onSubmit = vi.fn(), rules = productionRules) {
  render(
    <AKCNationalsLiveScoresheet
      entry={{
        id: '1',
        armband: 42,
        dogName: 'Luna',
        handlerName: 'Jane Smith',
        className: 'AKC Nationals',
        element: 'Master',
        level: 'Excellent',
      }}
      classInfo={{ element: 'Master', level: 'Excellent' }}
      rules={rules}
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />
  );
  return onSubmit;
}

function typeTime(area: number, value: string) {
  fireEvent.click(screen.getByTestId(`area-tab-${area}`));
  fireEvent.change(screen.getByLabelText(`Area ${area} time`), { target: { value } });
}

function fillAll(value: string) {
  for (let i = 1; i <= 5; i++) typeTime(i, value);
}

const saveButton = () => screen.getByTestId('submit-btn');

describe('AKCNationalsLiveScoresheet: a Qualified needs a valid time in every area', () => {
  beforeEach(() => {
    timer.maxTimes = [];
  });

  it('production rules really carry the whole class time per area', () => {
    expect(productionRules.areaMaxTimeSeconds).toEqual([300, 300, 300, 300, 300]);
  });

  it('stops the timer at class time / areas, not at areaMaxTimeSeconds', () => {
    renderSheet();
    expect(timer.maxTimes.at(-1)).toBe('1:00');
  });

  it('refuses a blank area and says why', () => {
    renderSheet();
    fillAll('0:30.00');
    typeTime(3, '');
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Add a time to save a Qualified');
  });

  it('refuses a zero time', () => {
    renderSheet();
    fillAll('0:30.00');
    typeTime(2, '0:00.00');
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(saveButton()).toBeDisabled();
  });

  it('refuses 1:01 in a 1:00 area, even though the class total is 5:00', () => {
    renderSheet();
    fillAll('0:30.00');
    typeTime(4, '1:01.00');
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1:01 is over the 1:00 limit. Fix the time, or choose NQ.'
    );
  });

  it('names the other area when the current one is fine', () => {
    renderSheet();
    fillAll('0:30.00');
    typeTime(4, '1:01.00');
    fireEvent.click(screen.getByTestId('area-tab-1'));
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(screen.getByRole('alert')).toHaveTextContent('Area 4: 1:01 is over the 1:00 limit');
  });

  it('saves at exactly the limit', async () => {
    const onSubmit = renderSheet();
    fillAll('1:00.00');
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('lets an NQ save with no times', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('result-NQ'));
    expect(saveButton()).toBeEnabled();
  });

  it('"Use max time" fills the area limit, not the class time', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Use max time' }));
    expect(screen.getByLabelText('Area 1 time')).toHaveValue('1:00.00');
  });
});

describe('AKCNationalsLiveScoresheet: area count is the Nationals format', () => {
  it.each([1, 2, 3])('a class with area_count %i still opens with 5 areas', count => {
    renderSheet(vi.fn(), buildResolvedClassRules({ area_count: count, time_limit_seconds: 300 }));
    for (let i = 1; i <= 5; i++) expect(screen.getByTestId(`area-tab-${i}`)).toBeInTheDocument();
    expect(screen.queryByTestId('area-tab-6')).toBeNull();
    expect(NATIONALS_AREA_COUNT).toBe(5);
  });
});

describe('AKCNationalsLiveScoresheet: finish call errors cost 5 points each (MYK9-1835)', () => {
  it('shows and saves points with the penalty applied', async () => {
    const onSubmit = renderSheet();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('correct-inc'));
    fireEvent.click(screen.getByTestId('fce-inc'));
    fireEvent.click(screen.getByTestId('fce-inc'));
    expect(screen.getByTestId('total-points')).toHaveTextContent('20');

    fillAll('0:30.00');
    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(saveButton());
    fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ points: 20, finishCallErrors: 2 })
      )
    );
  });
});
