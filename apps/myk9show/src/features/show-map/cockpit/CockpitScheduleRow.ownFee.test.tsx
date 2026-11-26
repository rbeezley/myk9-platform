import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { CockpitScheduleRow } from './CockpitScheduleRow';
import type { ScheduledClassModel } from './secretaryCockpitTypes';

const classItem: ScheduledClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Detective',
  timeLabel: '9:00 AM',
  scheduledStart: '9:00 AM',
  expectedStart: '9:00 AM',
  startedLabel: null,
  finishedLabel: null,
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  judgeName: null,
  filterFacts: {
    lifecycle: 'not-started',
    closeout: 'none',
    judge: { value: '~unassigned', label: 'Unassigned' },
    element: null,
    level: null,
  },
  attentionCount: 0,
  closeout: 'none',
  cardStatus: { progress: { scored: 0, total: 5 }, inRing: null, nextUp: [], nextStep: null },
};

function renderRow(ownFee: number | undefined) {
  render(
    <CockpitScheduleRow
      classItem={classItem}
      showId="show-1"
      ownFee={ownFee}
      focused={false}
      select={undefined}
      onFocusClass={vi.fn()}
    />
  );
}

describe("a class's own fee on the Show Desk schedule (MYK9-1931)", () => {
  it('shows the fee when the class has its own', () => {
    renderRow(40);

    expect(screen.getByTestId('class-own-fee')).toHaveTextContent('Fee $40');
  });

  it("says nothing for a class charging the show's fee", () => {
    renderRow(undefined);

    expect(screen.queryByText(/^Fee \$/)).not.toBeInTheDocument();
  });

  it('never shows a zero fee as a price', () => {
    renderRow(0);

    expect(screen.queryByText(/^Fee \$/)).not.toBeInTheDocument();
  });
});
