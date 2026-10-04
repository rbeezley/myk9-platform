/**
 * MYK9-998: Edit class sets the class's entry limit and "Allow wait list". Setup hands the panel
 * the mapped class (a judgeId, no estimatedJudgingTime), which renders the SIMPLE form, so the
 * controls are asserted there as well as in full mode.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import { replicatedToTrialClass, trialClassToReplicated } from '@/store/trial-store-helpers';
import type { ClassData } from '@/components/classes/types/classTypes';

vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

const setupClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    judgeId: 'TBD',
    judge: 'TBD',
    status: 'Scheduled',
    classOrder: '1',
    allowsWaitlist: false,
    ...extra,
  }) as Partial<ClassData>;

function open(initial: Partial<ClassData>, onSave = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Interior Novice"
      initialClassData={initial}
      onSave={onSave}
    />
  );
  return { ...view, onSave };
}

describe('ClassEditPanel: entry limit and wait list', () => {
  it('saves the limit and the wait list switch from the Setup (simple) form', async () => {
    const { user, onSave } = open(setupClass());
    const limit = await screen.findByLabelText(/Entry limit/);
    await user.type(limit, '12');
    await user.click(screen.getByRole('switch', { name: 'Allow wait list' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ maxEntries: 12, allowsWaitlist: true })
    );
  });

  it('shows the existing values and clears the limit with null, not 0 or 40', async () => {
    const { user, onSave } = open(setupClass({ maxEntries: 8, allowsWaitlist: true }));
    const limit = await screen.findByLabelText(/Entry limit/);
    expect(limit).toHaveValue(8);
    expect(screen.getByRole('switch', { name: 'Allow wait list' })).toBeChecked();
    await user.clear(limit);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ maxEntries: null }));
    // Unchanged, so not re-sent.
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('allowsWaitlist');
  });

  it('offers the same controls in full mode', async () => {
    open(setupClass({ estimatedJudgingTime: '00:02' }));
    expect(await screen.findByLabelText(/Entry limit/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Allow wait list' })).toBeInTheDocument();
  });
});

// Codex review of #2735: Trial Details hands the editor a TrialClass built by
// `replicatedToTrialClass`. That mapper used to drop both fields, so the editor read "no limit,
// wait list off" as fact and any save wrote it. Pinned on the real mapper, not a hand-built row.
async function changeStatus(user: ReturnType<typeof open>['user']) {
  await user.click(screen.getByRole('combobox', { name: /status/i }));
  await user.click(await screen.findByRole('option', { name: 'Completed' }));
}

describe('ClassEditPanel: classes handed over by Trial Details', () => {
  const replicated = (extra: Record<string, unknown>) =>
    ({
      id: 'cls-1',
      trialId: 't1',
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      section: 'A',
      judgeId: 'j1',
      judgeName: 'Judge',
      startTime: '',
      classStatus: 'Scheduled',
      ...extra,
    }) as unknown as Parameters<typeof replicatedToTrialClass>[0];

  it('keeps a loaded limit and wait list through the mapper and an unrelated edit', async () => {
    const trialClass = replicatedToTrialClass(replicated({ maxEntries: 12, allowsWaitlist: true }));
    expect(trialClass).toMatchObject({ maxEntries: 12, allowsWaitlist: true });
    const { user, onSave } = open(trialClass as unknown as Partial<ClassData>);
    expect(await screen.findByLabelText(/Entry limit/)).toHaveValue(12);
    expect(screen.getByRole('switch', { name: 'Allow wait list' })).toBeChecked();
    await changeStatus(user);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty('maxEntries');
    expect(saved).not.toHaveProperty('allowsWaitlist');
  });

  it('a source that did not load them shows no controls and never sends them', async () => {
    const { user, onSave } = open(setupClass({ allowsWaitlist: undefined, maxEntries: undefined }));
    await screen.findByRole('button', { name: 'Save Changes' });
    expect(screen.queryByLabelText(/Entry limit/)).not.toBeInTheDocument();
    await changeStatus(user);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty('maxEntries');
    expect(saved).not.toHaveProperty('allowsWaitlist');
  });

  it('round-trips both fields back to the replicated row', () => {
    const tc = replicatedToTrialClass(replicated({ maxEntries: 12, allowsWaitlist: true }));
    expect(trialClassToReplicated(tc, 't1')).toMatchObject({
      maxEntries: 12,
      allowsWaitlist: true,
    });
  });
});
