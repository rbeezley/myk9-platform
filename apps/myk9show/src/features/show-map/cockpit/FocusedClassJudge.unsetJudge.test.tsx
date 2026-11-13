import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils/testUtils';

import { FocusedClassJudge } from './FocusedClassJudge';

function renderJudge(judgeName: string | null, assignedJudgeId: string | null) {
  render(
    <FocusedClassJudge
      showId="show-1"
      classId="class-1"
      classLabel="Container Novice"
      judgeName={judgeName}
      assignedJudgeId={assignedJudgeId}
      availableJudges={[]}
      judgeListStatus="ready"
      lockReason="Locked once the class starts."
      onJudgeChange={vi.fn()}
    />
  );
}

describe('FocusedClassJudge unset judge (MYK9-1846)', () => {
  it('shows a real name as is', () => {
    renderJudge('Pat Lee', 'j1');
    expect(screen.getByText('Pat Lee')).toBeInTheDocument();
  });

  it('reads Judge to be announced for a stored TBD and for an empty name', () => {
    renderJudge('TBD', null);
    expect(screen.getByText('Judge to be announced')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('reads Judge to be announced for an empty name, never Judge not set', () => {
    renderJudge(null, null);
    expect(screen.getByText('Judge to be announced')).toBeInTheDocument();
    expect(screen.queryByText('Judge not set')).not.toBeInTheDocument();
  });

  it('keeps Judge assigned when an id has no resolved name', () => {
    renderJudge(null, 'j1');
    expect(screen.getByText('Judge assigned')).toBeInTheDocument();
  });
});
