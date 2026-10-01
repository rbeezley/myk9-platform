import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { SetupClassDialogs } from '../SetupClassDialogs';

// MYK9-900: the edit panel's save must REJECT when the write cannot happen (offline or failed),
// because EditPanelWrapper keeps the panel open with the user's edits only on a rejected onSave
// (EditPanelWrapper.tsx wrappedSave/handleSave catch). Resolving would close it and discard them.

let mockConnectionHint: string | undefined;
const updateClass = vi.hoisted(() => vi.fn());
const onClose = vi.fn();

vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => mockConnectionHint }));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      {
        id: 'c1',
        trialId: 't1',
        element: 'Containers',
        level: 'Novice',
        section: 'A',
        judgeId: 'j1',
      },
    ],
    updateClass,
    deleteClass: vi.fn(),
  }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/components/panels/edit/ClassEditPanel', () => ({
  ClassEditPanel: ({ onSave }: { onSave: (data: Record<string, unknown>) => Promise<void> }) => (
    <button
      type="button"
      onClick={() => {
        onSave({ judgeId: 'j2' }).then(
          () => {
            document.body.dataset.saveResult = 'resolved';
          },
          (error: Error) => {
            document.body.dataset.saveResult = `rejected:${error.message}`;
          }
        );
      }}
    >
      save
    </button>
  ),
}));
vi.mock('@/pages/ClassDetailsPage/DeleteClassDialog', () => ({
  DeleteClassDialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const renderDialogs = () =>
  render(
    <SetupClassDialogs
      showId="s1"
      pending={{
        action: 'edit',
        trialId: 't1',
        requestId: 1,
        classSnapshot: {
          id: 'c1',
          trialId: 't1',
          element: 'Containers',
          level: 'Novice',
          section: 'A',
          judgeId: 'j1',
        } as never,
      }}
      onClose={onClose}
    />
  );

describe('SetupClassDialogs save contract', () => {
  beforeEach(() => {
    mockConnectionHint = undefined;
    delete document.body.dataset.saveResult;
    updateClass.mockReset();
    onClose.mockClear();
  });

  it('rejects offline without writing', async () => {
    mockConnectionHint = 'Needs a connection';
    const { user } = renderDialogs();

    await user.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(document.body.dataset.saveResult).toMatch(/^rejected:.*needs a connection/i)
    );
    expect(updateClass).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects when the update fails', async () => {
    updateClass.mockRejectedValue(new Error('Server said no'));
    const { user } = renderDialogs();

    await user.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(document.body.dataset.saveResult).toBe('rejected:Server said no'));
  });

  it('resolves when the update succeeds', async () => {
    updateClass.mockResolvedValue(undefined);
    const { user } = renderDialogs();

    await user.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(document.body.dataset.saveResult).toBe('resolved'));
    expect(updateClass).toHaveBeenCalledWith('c1', expect.objectContaining({ judgeId: 'j2' }));
  });
});
