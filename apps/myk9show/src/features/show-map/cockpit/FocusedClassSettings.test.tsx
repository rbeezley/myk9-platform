import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { FocusedClassSettings } from './FocusedClassSettings';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

vi.mock('./FocusedClassJudge', () => ({
  FocusedClassJudge: () => <div>live judge picker</div>,
}));
vi.mock('./SubstituteJudgeEmailOffer', () => ({
  SubstituteJudgeEmailOffer: () => <div>substitute email offer</div>,
}));
vi.mock('./FocusedClassScoringControls', () => ({
  FocusedClassJudgeScoring: () => <div>judge scoring choice</div>,
  FocusedClassScoringField: () => <div>class scoring</div>,
}));
vi.mock('./FocusedClassStewards', () => ({ FocusedClassStewards: () => <div>stewards</div> }));
vi.mock('./ClassOperationalControls', async importOriginal => ({
  ...(await importOriginal<typeof import('./ClassOperationalControls')>()),
  useClassStatusChange: () => ({ isSaving: false, update: vi.fn(), confirmDialog: null }),
}));

const trial: SecretaryCockpitTrial = { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 };
const focused = {
  id: 'class-1',
  name: 'Exterior Excellent',
  lifecycle: { evidence: 'recorded', value: 'in-progress' },
  progress: { evidence: 'computed', value: { completed: 1, total: 4 } },
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
} as unknown as FocusedClassModel;
const source = {
  id: 'class-1',
  scheduledStart: '9:00 AM',
  lifecycle: 'in-progress',
  judgeId: 'judge-1',
  judgeName: 'Jane Judge',
} as unknown as SecretaryCockpitClass;
const judges = {} as never;

const renderSettings = (showJudge: boolean) =>
  render(
    <FocusedClassSettings
      showId="show-1"
      focused={focused}
      sourceClass={source}
      trial={trial}
      timeZone="America/Chicago"
      classes={[source]}
      judges={judges}
      showJudge={showJudge}
    />
  );

describe('FocusedClassSettings once the class has started (MYK9-2379)', () => {
  it('drops only the live judge picker, and keeps the substitute email offer and the judge scoring choice', () => {
    renderSettings(false);

    expect(screen.queryByText('live judge picker')).not.toBeInTheDocument();
    expect(screen.getByText('substitute email offer')).toBeInTheDocument();
    expect(screen.getByText('judge scoring choice')).toBeInTheDocument();
  });

  it('before the class starts, the picker is there and the actions are not repeated', () => {
    renderSettings(true);

    expect(screen.getByText('live judge picker')).toBeInTheDocument();
    expect(screen.getAllByText('judge scoring choice')).toHaveLength(1);
  });
});
