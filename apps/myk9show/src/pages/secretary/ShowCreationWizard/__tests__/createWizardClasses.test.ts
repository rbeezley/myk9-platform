import { describe, expect, it, vi } from 'vitest';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import { createWizardClasses, type WizardClassWriters } from '../createWizardClasses';

const baseClass: ClassData = {
  id: 'class-1',
  trialId: 'trial-1',
  trial: 'Saturday Trial',
  trialDate: '2026-06-01',
  trialNumber: '1',
  classOrder: '1',
  status: 'Scheduled',
  judge: 'Jane Smith',
  judgeId: 'person-jane',
  element: 'Buried',
  level: 'Master',
  className: 'Buried Master',
};

function writers(): WizardClassWriters & {
  createClass: ReturnType<typeof vi.fn>;
  assignClassJudge: ReturnType<typeof vi.fn>;
} {
  return {
    createClass: vi.fn().mockResolvedValue(undefined),
    assignClassJudge: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * MYK9-479. The offline / edit-mode wizard path used to persist the picked
 * judge only as the class's `judgeName` string, and never wrote a class-level
 * judge_assignments row. With `classes.judge_name` dropped, the assignment row
 * is the only judge a class has — so the pick must become one.
 */
describe('createWizardClasses', () => {
  it('creates the class and its class-level judge assignment, keyed by the same class id', async () => {
    const w = writers();

    await createWizardClasses('show-1', [baseClass], new Map(), w);

    expect(w.createClass).toHaveBeenCalledTimes(1);
    const created = w.createClass.mock.calls[0]![0];
    expect(created).toMatchObject({
      id: 'class-1',
      judgeName: 'Jane Smith',
      judgeId: 'person-jane',
    });
    expect(w.assignClassJudge).toHaveBeenCalledWith('show-1', 'class-1', 'person-jane');
  });

  it('uses the generated class id when the wizard row has none', async () => {
    const w = writers();

    await createWizardClasses('show-1', [{ ...baseClass, id: '' }], new Map(), w);

    const created = w.createClass.mock.calls[0]![0] as { id: string };
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(w.assignClassJudge).toHaveBeenCalledWith('show-1', created.id, 'person-jane');
  });

  it('writes no assignment for a class with no judge picked', async () => {
    const w = writers();

    await createWizardClasses(
      'show-1',
      [{ ...baseClass, judge: 'TBD', judgeId: undefined }],
      new Map(),
      w
    );

    expect(w.createClass).toHaveBeenCalledTimes(1);
    expect(w.assignClassJudge).not.toHaveBeenCalled();
  });

  it('bakes the matched sport rule into the class it creates', async () => {
    const w = writers();
    const rule = { timer_mode: 'single', hides_known: true, area_count: 2 } as SportClassRuleRow;
    const ruleMap = new Map([['tmpl|Buried|Master', rule]]);

    await createWizardClasses('show-1', [{ ...baseClass, templateId: 'tmpl' }], ruleMap, w);

    expect(w.createClass.mock.calls[0]![0]).toMatchObject({
      timerMode: 'single',
      hidesKnown: true,
      areaCount: 2,
    });
  });

  it('surfaces a failed assignment write instead of swallowing it', async () => {
    const w = writers();
    w.assignClassJudge.mockRejectedValue(new Error('assignment failed'));

    await expect(createWizardClasses('show-1', [baseClass], new Map(), w)).rejects.toThrow(
      'assignment failed'
    );
  });
});
