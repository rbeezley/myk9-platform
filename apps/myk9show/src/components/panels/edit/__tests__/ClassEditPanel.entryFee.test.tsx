/**
 * MYK9-1931: Edit class has one fee field, "Entry fee for this class", empty unless the
 * secretary chose a fee for the class. Empty charges the show's fee. The old "Pre-Entry Fee"
 * and "Day-of-Show Fee" fields had no column behind them and are gone. A changed fee never
 * reprices existing entries, and the form says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import { mapClassInputToUpdate } from '@/services/mappers/classMappers';
import { replicatedToTrialClass } from '@/store/trial-store-helpers';
import type { ClassData } from '@/components/classes/types/classTypes';

const entriesByClass = vi.hoisted(() => ({ data: undefined as unknown[] | undefined }));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', preEntryFee: '25' }] }),
}));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));
vi.mock('@/hooks/queries/useClassesDatabase', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useClassesDatabase')>()),
  useEntriesByClassQuery: () => ({ data: entriesByClass.data }),
}));

// The Setup snapshot shape (`mapDatabaseToClass`): a judgeId, no estimatedJudgingTime, so the
// panel renders its simple form; a NULL fee arrives as 0.
const setupClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Detective',
    level: 'Novice',
    section: '',
    judgeId: 'TBD',
    judge: 'TBD',
    status: 'Scheduled',
    classOrder: '1',
    allowsWaitlist: null,
    entryFee: 0,
    ...extra,
  }) as Partial<ClassData>;

function open(initial: Partial<ClassData>, onSave = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Detective Novice"
      initialClassData={initial}
      showId="show-1"
      onSave={onSave}
    />
  );
  return { ...view, onSave };
}

async function save(user: ReturnType<typeof open>['user'], onSave: ReturnType<typeof vi.fn>) {
  await user.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  entriesByClass.data = undefined;
});

describe('Edit class: entry fee for this class', () => {
  it("is empty by default and says the show's fee is charged", async () => {
    open(setupClass());
    const field = await screen.findByLabelText(/Entry fee for this class/);
    expect(field).toHaveValue('');
    expect(screen.getByText("Leave empty to charge the show's fee ($25).")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pre-Entry Fee/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Day-of-Show Fee/)).not.toBeInTheDocument();
  });

  it("saves a fee typed for the class as the class's own fee", async () => {
    const { user, onSave } = open(setupClass());
    await user.type(await screen.findByLabelText(/Entry fee for this class/), '40');
    const saved = await save(user, onSave);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ entryFee: 40 }));
    expect(mapClassInputToUpdate({ entryFee: saved.entryFee as number })).toEqual({
      entry_fee: 40,
    });
  });

  it("shows a class's own fee, and emptying it returns the class to the show's fee", async () => {
    const { user, onSave } = open(setupClass({ entryFee: 40 }));
    const field = await screen.findByLabelText(/Entry fee for this class/);
    expect(field).toHaveValue('40.00');
    await user.clear(field);
    const saved = await save(user, onSave);
    expect(saved).toMatchObject({ entryFee: 0 });
    // Empty is stored as NULL, never as a $0 price.
    expect(mapClassInputToUpdate({ entryFee: saved.entryFee as number })).toEqual({
      entry_fee: null,
    });
  });

  it('does not send the fee when only something else changed', async () => {
    const { user, onSave } = open(setupClass({ entryFee: 40 }));
    await screen.findByLabelText(/Entry fee for this class/);
    await user.type(screen.getByLabelText(/Entry limit/), '12');
    const saved = await save(user, onSave);
    expect(saved).not.toHaveProperty('entryFee');
  });

  it('says existing entries keep the fee they were charged', async () => {
    entriesByClass.data = Array.from({ length: 6 }, (_, index) => ({ id: `e${index}` }));
    open(setupClass({ entryFee: 40 }));
    expect(
      await screen.findByText(
        'This changes the fee for new entries only. 6 existing entries keep the fee they were charged.'
      )
    ).toBeInTheDocument();
  });

  it('says nothing about existing entries when the class has none', async () => {
    entriesByClass.data = [];
    open(setupClass());
    await screen.findByLabelText(/Entry fee for this class/);
    expect(screen.queryByText(/existing entr/)).not.toBeInTheDocument();
  });

  it('carries the fee for a class handed over by Trial Details', async () => {
    const trialClass = replicatedToTrialClass({
      id: 'cls-1',
      trialId: 't1',
      name: 'Detective Novice',
      element: 'Detective',
      level: 'Novice',
      section: '',
      judgeId: 'j1',
      judgeName: 'Judge',
      startTime: '',
      classStatus: 'Scheduled',
      entryFee: 40,
    } as unknown as Parameters<typeof replicatedToTrialClass>[0]);
    open(trialClass as unknown as Partial<ClassData>);
    expect(await screen.findByLabelText(/Entry fee for this class/)).toHaveValue('40.00');
  });

  it('shows no fee field for a source that did not carry the fee', async () => {
    open(setupClass({ entryFee: undefined }));
    await screen.findByRole('button', { name: 'Save Changes' });
    expect(screen.queryByLabelText(/Entry fee for this class/)).not.toBeInTheDocument();
  });
});
