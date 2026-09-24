/**
 * MYK9-644 F50: the Review step read "ready with 1 trials". F9 fixed the classes
 * half earlier; both counts, and the judge-coverage warning, follow the number.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ReviewStepActions } from '../ReviewStepActions';

function renderActions(counts: {
  trialCount: number;
  totalClasses: number;
  classesWithJudges: number;
}) {
  render(
    <ReviewStepActions
      errorCount={0}
      showName="Spring Classic"
      totalJudges={1}
      isLoading={false}
      submitLabel="Add Show"
      onCreateShow={vi.fn()}
      {...counts}
    />
  );
}

describe('ReviewStepActions counts', () => {
  it('uses the singular for one trial, one class and one class missing a judge', () => {
    renderActions({ trialCount: 1, totalClasses: 1, classesWithJudges: 0 });

    expect(screen.getByText('"Spring Classic" ready with 1 trial and 1 class')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 class needs a judge')).toBeInTheDocument();
  });

  it('uses the plural for several trials and classes', () => {
    renderActions({ trialCount: 2, totalClasses: 5, classesWithJudges: 3 });

    expect(
      screen.getByText('"Spring Classic" ready with 2 trials and 5 classes')
    ).toBeInTheDocument();
    expect(screen.getByText('2 of 5 classes need judges')).toBeInTheDocument();
  });
});
