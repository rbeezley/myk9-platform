import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  persistShowJudgeAssignments: vi.fn(),
  saveShowJudgeChanges: vi.fn(),
}));

vi.mock('@/services/database/judges', () => mocks);
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn() } }));

import { saveWizardShowJudges } from './saveWizardShowJudges';

const j = (judgeId: string) => ({ judgeId });

describe('saveWizardShowJudges (MYK9-772)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistShowJudgeAssignments.mockResolvedValue(undefined);
    mocks.saveShowJudgeChanges.mockResolvedValue(undefined);
  });

  it('an edit saves the change from the list it started with, never a replace', async () => {
    const ok = await saveWizardShowJudges({
      showId: 'show-1',
      isEdit: true,
      loadedJudges: [j('a'), j('b')],
      judges: [j('b'), j('c')],
    });
    expect(ok).toBe(true);
    expect(mocks.saveShowJudgeChanges).toHaveBeenCalledWith(
      'show-1',
      [j('a'), j('b')],
      [j('b'), j('c')]
    );
    expect(mocks.persistShowJudgeAssignments).not.toHaveBeenCalled();
  });

  it('an edit that clears every judge still saves (the old gate skipped it)', async () => {
    await saveWizardShowJudges({
      showId: 'show-1',
      isEdit: true,
      loadedJudges: [j('a')],
      judges: [],
    });
    expect(mocks.saveShowJudgeChanges).toHaveBeenCalledWith('show-1', [j('a')], []);
  });

  it('a new show only adds its judges', async () => {
    await saveWizardShowJudges({
      showId: 'show-1',
      isEdit: false,
      loadedJudges: [],
      judges: [j('a')],
    });
    expect(mocks.persistShowJudgeAssignments).toHaveBeenCalledWith('show-1', [j('a')]);
    expect(mocks.saveShowJudgeChanges).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing, so the caller can warn', async () => {
    mocks.saveShowJudgeChanges.mockRejectedValue(new Error('read timed out'));
    const ok = await saveWizardShowJudges({
      showId: 'show-1',
      isEdit: true,
      loadedJudges: [],
      judges: [j('a')],
    });
    expect(ok).toBe(false);
  });
});
