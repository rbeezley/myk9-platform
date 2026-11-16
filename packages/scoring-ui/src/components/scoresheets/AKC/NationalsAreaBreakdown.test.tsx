/**
 * MYK9-1835: the judge copies the Nationals read-back onto paper, so its lines must add up
 * to Total Points, finish call errors included.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NationalsAreaBreakdown } from './NationalsAreaBreakdown';
import { calculatePoints } from './nationalsAlerts';

const areas = ['Area 1', 'Area 2'].map(areaName => ({
  areaName,
  time: '0:30.00',
  found: false,
  correct: false,
}));

/** Every signed number the breakdown shows, summed. */
function shownSum(): number {
  return screen.getAllByText(/^[+-]\d+$/).reduce((total, el) => total + Number(el.textContent), 0);
}

describe('NationalsAreaBreakdown', () => {
  it('shows the finish call deduction, so the lines add up to Total Points', () => {
    const correct = [2, 1];
    const incorrect = [1, 0];
    render(
      <NationalsAreaBreakdown
        areas={areas}
        correctAlerts={correct}
        incorrectAlerts={incorrect}
        finishCallErrors={2}
      />
    );

    expect(screen.getByText('Finish call errors (2)')).toBeInTheDocument();
    expect(screen.getByText('-10')).toBeInTheDocument();
    expect(shownSum()).toBe(calculatePoints(correct, incorrect, 2));
  });

  it('shows no finish call line when there are none', () => {
    render(
      <NationalsAreaBreakdown
        areas={areas}
        correctAlerts={[1, 0]}
        incorrectAlerts={[0, 0]}
        finishCallErrors={0}
      />
    );

    expect(screen.queryByText(/Finish call errors/)).toBeNull();
    expect(shownSum()).toBe(10);
  });

  it('says a run never scores below 0 when its lines add up to less', () => {
    render(
      <NationalsAreaBreakdown
        areas={areas}
        correctAlerts={[0, 0]}
        incorrectAlerts={[1, 0]}
        finishCallErrors={1}
      />
    );

    expect(
      screen.getByText('These add up to -10; a run never scores below 0.')
    ).toBeInTheDocument();
    expect(calculatePoints([0, 0], [1, 0], 1)).toBe(0);
  });
});
