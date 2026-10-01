import React from 'react';
import { act, createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
import {
  TrialManagementDialogs,
  type TrialManagementDialogsHandle,
  type TrialManagementDialogsProps,
} from '../TrialManagementDialogs';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { TrialWithClasses } from '@/hooks/useTrialDetailData';
import type { Show } from '@/types/show-types';

// The panels and the shared delete dialog are mocked to testid stubs; this suite
// verifies that the imperative open* methods drive the right one open, and that
// both deletes go through the ONE shared dialog with the right kind and target.
vi.mock('@/components/panels/edit/TrialEditPanel', () => ({
  TrialEditPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-trial-panel" /> : null,
}));
vi.mock('@/components/panels/edit/ClassEditPanel', () => ({
  ClassEditPanel: ({ open, onSave }: { open: boolean; onSave: (data: object) => Promise<void> }) =>
    open ? (
      <div data-testid="edit-class-panel">
        <button onClick={() => void onSave({})}>Save class</button>
      </div>
    ) : null,
}));
vi.mock('@/features/delete/DeleteObjectDialog', () => ({
  DeleteObjectDialog: ({
    kind,
    targets,
  }: {
    kind: string;
    targets: Array<{ id: string; name: string; detail?: string; context?: object }>;
  }) => (
    <div data-testid={`delete-${kind}-dialog`} data-target={JSON.stringify(targets)}>
      {targets.map(target => target.name).join(', ')}
    </div>
  ),
}));
vi.mock('@/store/trialStore', () => {
  const state = {
    trials: [],
    updateTrial: vi.fn(),
    loadTrialClasses: vi.fn(),
  };
  const hook = Object.assign(() => state, { getState: () => state });
  return { useTrialStore: hook };
});
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ updateClass: vi.fn() }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));

function makeTrial(): TrialWithClasses {
  return {
    id: 't1',
    type: 'Trial 1',
    name: 'Saturday Trial 1',
    trialNumber: '1',
    trialDate: '2026-05-09',
    showId: 's1',
    classes: [],
  } as unknown as TrialWithClasses;
}

function makeClass(): TrialClass {
  return { id: 'c1', element: 'Container', level: 'Novice', section: 'A' } as unknown as TrialClass;
}

function renderDialogs(overrides: Partial<TrialManagementDialogsProps> = {}) {
  const ref = React.createRef<TrialManagementDialogsHandle>();
  const queryClient = createTestQueryClient();
  const props: TrialManagementDialogsProps = {
    currentTrial: makeTrial(),
    parentShow: { id: 's1', organization: 'AKC' } as Show,
    ...overrides,
  };
  const rendered = render(<TrialManagementDialogs ref={ref} {...props} />, {
    initialRoute: '/shows/s1/trials/t1',
    queryClient,
  });
  return { ref, queryClient, ...rendered };
}

describe('TrialManagementDialogs', () => {
  it('renders nothing open initially', () => {
    renderDialogs();
    expect(screen.queryByTestId('edit-trial-panel')).toBeNull();
    expect(screen.queryByTestId('delete-trial-dialog')).toBeNull();
    expect(screen.queryByTestId('edit-class-panel')).toBeNull();
    expect(screen.queryByTestId('delete-class-dialog')).toBeNull();
  });

  it('openEditTrial() opens the trial edit panel', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openEditTrial());
    expect(screen.getByTestId('edit-trial-panel')).toBeInTheDocument();
  });

  it('openDeleteTrial() opens the shared delete dialog for this trial', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openDeleteTrial());
    const dialog = screen.getByTestId('delete-trial-dialog');
    const [target] = JSON.parse(dialog.dataset.target ?? '[]');
    expect(target).toMatchObject({
      id: 't1',
      name: 'Saturday Trial 1',
      context: { showId: 's1', trialId: 't1' },
    });
    expect(target.detail).toMatch(/^Saturday Trial 1 · May 9, 2026$/);
  });

  it('openEditClass() opens the class edit panel', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openEditClass(makeClass()));
    expect(screen.getByTestId('edit-class-panel')).toBeInTheDocument();
  });

  it('openDeleteClass() opens the shared delete dialog for that class (same purge as Setup)', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openDeleteClass(makeClass()));
    const dialog = screen.getByTestId('delete-class-dialog');
    const [target] = JSON.parse(dialog.dataset.target ?? '[]');
    expect(target).toMatchObject({
      id: 'c1',
      name: 'Container Novice A',
      detail: 'Novice Container · Saturday Trial 1',
      context: { showId: 's1', trialId: 't1' },
    });
  });

  it('invalidates class queries on the active routed client after an edit', async () => {
    const { ref, queryClient, user } = renderDialogs();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => ref.current?.openEditClass(makeClass()));
    await user.click(screen.getByRole('button', { name: 'Save class' }));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'list'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'trial', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'detail', 'c1'] });
  });
});
