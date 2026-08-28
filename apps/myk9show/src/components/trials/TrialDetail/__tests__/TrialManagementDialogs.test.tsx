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

// The dialogs themselves are mocked to testid stubs; this suite verifies that
// the imperative open* methods drive the right dialog open, and that the
// delete-class copy reflects the entry count.
vi.mock('@/components/classes/AddClassesToTrialPanel', () => ({
  AddClassesToTrialPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-classes-panel" /> : null,
}));
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
vi.mock('@/components/common/StandardDialog', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="delete-trial-dialog">{children}</div> : null,
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="delete-class-dialog">{children}</div> : null,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/store/trialStore', () => {
  const state = {
    trials: [],
    updateTrial: vi.fn(),
    deleteTrial: vi.fn(),
    loadTrialClasses: vi.fn(),
  };
  const hook = Object.assign(() => state, { getState: () => state });
  return { useTrialStore: hook };
});
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ addClass: vi.fn(), updateClass: vi.fn(), deleteClass: vi.fn() }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));
vi.mock('@/store/templateStore', () => ({
  useTemplateStore: () => ({ templates: [], loadTemplatesFromDB: vi.fn() }),
}));
vi.mock('@/hooks/useTrialTemplates', () => ({
  useTrialTemplates: () => ({ handleSaveClassesFromTemplate: vi.fn() }),
}));

function makeTrial(): TrialWithClasses {
  return {
    id: 't1',
    type: 'Trial 1',
    trialNumber: '1',
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
    existingClasses: [],
    entryCountByClass: new Map(),
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
    expect(screen.queryByTestId('add-classes-panel')).toBeNull();
    expect(screen.queryByTestId('edit-class-panel')).toBeNull();
    expect(screen.queryByTestId('delete-class-dialog')).toBeNull();
  });

  it('openEditTrial() opens the trial edit panel', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openEditTrial());
    expect(screen.getByTestId('edit-trial-panel')).toBeInTheDocument();
  });

  it('openDeleteTrial() opens the delete-trial dialog', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openDeleteTrial());
    expect(screen.getByTestId('delete-trial-dialog')).toBeInTheDocument();
  });

  it('openAddClasses() opens the add-classes panel', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openAddClasses());
    expect(screen.getByTestId('add-classes-panel')).toBeInTheDocument();
  });

  it('openEditClass() opens the class edit panel', () => {
    const { ref } = renderDialogs();
    act(() => ref.current?.openEditClass(makeClass()));
    expect(screen.getByTestId('edit-class-panel')).toBeInTheDocument();
  });

  it('openDeleteClass() opens the delete-class dialog with the entry-count warning', () => {
    const { ref } = renderDialogs({ entryCountByClass: new Map([['c1', 3]]) });
    act(() => ref.current?.openDeleteClass(makeClass()));
    const dialog = screen.getByTestId('delete-class-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('This will also delete 3 entries for this class.');
  });

  it('omits the entry-count warning when the class has no entries', () => {
    const { ref } = renderDialogs({ entryCountByClass: new Map() });
    act(() => ref.current?.openDeleteClass(makeClass()));
    expect(screen.getByTestId('delete-class-dialog')).not.toHaveTextContent(
      'This will also delete'
    );
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
