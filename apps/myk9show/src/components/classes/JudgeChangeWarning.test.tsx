/**
 * MYK9-2015: changing the judge of a started class warns that the outgoing judge's phone may
 * hold scores that have not arrived. The class's dogs come from this device's replica.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { JudgeChangeWarning } from './JudgeChangeWarning';

const snapshot = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>> | null,
  failed: false,
  classIds: [] as string[],
}));
vi.mock('@/features/at-show/useClassEntriesSnapshot', () => ({
  useClassEntriesSnapshot: (classId: string) => {
    snapshot.classIds.push(classId);
    return { rows: snapshot.rows, failed: snapshot.failed, retry: vi.fn() };
  },
}));

const WARNING = "Pat Rivera may have scores on their phone that haven't arrived.";

function renderWarning(props: Partial<Parameters<typeof JudgeChangeWarning>[0]> = {}) {
  return render(
    <JudgeChangeWarning
      classId="class-1"
      classStatus="Scheduled"
      outgoingJudgeId="judge-a"
      outgoingJudgeName="Pat Rivera"
      selectedJudgeId="judge-b"
      {...props}
    />
  );
}

describe('JudgeChangeWarning', () => {
  beforeEach(() => {
    snapshot.rows = [];
    snapshot.failed = false;
    snapshot.classIds = [];
  });

  it('names the outgoing judge when a dog in the class is checked in', async () => {
    snapshot.rows = [
      { check_in_status: 'no-status', entry_status: 'confirmed' },
      { check_in_status: 'checked-in', entry_status: 'confirmed' },
    ];
    renderWarning();
    expect(await screen.findByRole('status')).toHaveTextContent(WARNING);
    expect(snapshot.classIds).toContain('class-1');
  });

  it('warns for a class whose status says it is in progress', async () => {
    renderWarning({ classStatus: 'In Progress' });
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });

  it('says nothing for a class that has not started', async () => {
    snapshot.rows = [{ check_in_status: 'no-status', entry_status: 'confirmed' }];
    renderWarning();
    await waitFor(() => expect(snapshot.classIds).toContain('class-1'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says nothing until the judge actually changes, or when the class had no judge', () => {
    snapshot.rows = [{ check_in_status: 'checked-in', entry_status: 'confirmed' }];
    const { rerender } = renderWarning({ selectedJudgeId: 'judge-a' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(
      <JudgeChangeWarning
        classId="class-1"
        classStatus="Scheduled"
        outgoingJudgeId="TBD"
        outgoingJudgeName="TBD"
        selectedJudgeId="judge-b"
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // The entries were never read for either: nothing to warn about.
    expect(snapshot.classIds).toEqual([]);
  });

  it('warns when the class dogs cannot be read, since it may have started', async () => {
    snapshot.rows = null;
    snapshot.failed = true;
    renderWarning();
    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });

  it('still warns when the outgoing judge has no name on this device', async () => {
    snapshot.rows = [{ check_in_status: 'in-ring', entry_status: 'confirmed' }];
    renderWarning({ outgoingJudgeName: '' });
    expect(
      await screen.findByText(
        "The judge you replaced may have scores on their phone that haven't arrived."
      )
    ).toBeInTheDocument();
  });
});
