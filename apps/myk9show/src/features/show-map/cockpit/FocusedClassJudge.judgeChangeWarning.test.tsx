/**
 * MYK9-2015: the Show Desk judge picker saves on tap, and stays open while dogs are checked in
 * but none is scored yet (the outgoing judge's scores may all be offline on their phone). After
 * a change on a started class, the field names the judge it replaced; not otherwise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { FocusedClassJudge } from './FocusedClassJudge';

const snapshot = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  reads: [] as string[],
}));
vi.mock('@/features/at-show/useClassEntriesSnapshot', () => ({
  useClassEntriesSnapshot: (classId: string) => {
    snapshot.reads.push(classId);
    return { rows: snapshot.rows, failed: false, retry: vi.fn() };
  },
}));

const WARNING = "Pat Rivera may have scores on their phone that haven't arrived.";
const JUDGES = [
  { id: 'judge-a', name: 'Pat Rivera' },
  { id: 'judge-b', name: 'Lee Okafor' },
];

function Picker({
  assignedJudgeId,
  judgeName,
  onJudgeChange,
}: {
  assignedJudgeId: string;
  judgeName: string;
  onJudgeChange: (classId: string, judgeId: string) => void;
}) {
  return (
    <FocusedClassJudge
      showId="show-1"
      classId="class-1"
      classLabel="Container Novice A"
      judgeName={judgeName}
      assignedJudgeId={assignedJudgeId}
      availableJudges={JUDGES}
      judgeListStatus="ready"
      lockReason={null}
      classStatus="Scheduled"
      onJudgeChange={onJudgeChange}
    />
  );
}

async function changeToJudgeB() {
  const onJudgeChange = vi.fn();
  const view = render(
    <Picker assignedJudgeId="judge-a" judgeName="Pat Rivera" onJudgeChange={onJudgeChange} />
  );
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  await view.user.click(screen.getByRole('combobox', { name: /judge for container novice a/i }));
  await view.user.click(await screen.findByRole('option', { name: /Lee Okafor/ }));
  expect(onJudgeChange).toHaveBeenCalledWith('class-1', 'judge-b');
  // The replicated write lands: the class now reads judge B.
  view.rerender(
    <Picker assignedJudgeId="judge-b" judgeName="Lee Okafor" onJudgeChange={onJudgeChange} />
  );
  return view;
}

describe('FocusedClassJudge judge-change warning (MYK9-2015)', () => {
  beforeEach(() => {
    snapshot.rows = [];
    snapshot.reads = [];
  });

  it('names the outgoing judge after changing the judge of a class with a dog checked in', async () => {
    snapshot.rows = [
      { entry_status: 'confirmed', check_in_status: 'no-status' },
      { entry_status: 'confirmed', check_in_status: 'checked-in' },
    ];
    await changeToJudgeB();
    expect(await screen.findByRole('status')).toHaveTextContent(WARNING);
  });

  it('says nothing for a class with no dog checked in', async () => {
    snapshot.rows = [{ entry_status: 'confirmed', check_in_status: 'no-status' }];
    await changeToJudgeB();
    await waitFor(() => expect(snapshot.reads).toContain('class-1'));
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('clears when the judge is changed back', async () => {
    snapshot.rows = [{ entry_status: 'confirmed', check_in_status: 'checked-in' }];
    const { rerender } = await changeToJudgeB();
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
    rerender(<Picker assignedJudgeId="judge-a" judgeName="Pat Rivera" onJudgeChange={vi.fn()} />);
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
