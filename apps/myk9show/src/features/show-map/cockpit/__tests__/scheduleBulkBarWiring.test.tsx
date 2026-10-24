import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

// MYK9-1352: the two wiring paths between Select classes' ScheduleBulkBar and the shared bulk
// machinery that the shared bar/hook tests cannot see.

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));

const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));

const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));

const applyManualClassStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus }));

// The summary toast is the only way to reach "Retry failed"; capture its options.
const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock('sonner', async importOriginal => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: Object.assign(vi.fn(), toastMocks),
}));

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));

const classOf = (overrides: Partial<SecretaryCockpitClass>): SecretaryCockpitClass => ({
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  classOrder: 0,
  lifecycle: 'not-started',
  status: 'not_started',
  entryCount: 10,
  scoredCount: 0,
  judgeName: null,
  judgeId: null,
  entryRows: [],
  attention: [],
  actions: [],
  paperwork: [],
  ...overrides,
});

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [
    { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 },
    { id: 'trial-2', date: '2026-07-21', number: '2', order: 1 },
  ],
  classes: [
    classOf({ id: 'class-1', name: 'Container Novice', classOrder: 0 }),
    classOf({
      id: 'class-3',
      name: 'Exterior Novice',
      classOrder: 1,
      lifecycle: 'in-progress',
      status: 'in_progress',
    }),
    classOf({ id: 'class-9', trialId: 'trial-2', name: 'Buried Novice', classOrder: 0 }),
  ],
};

const renderCockpit = () =>
  render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
    initialRoute: '/shows/show-1?select=classes',
  });

const tick = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });

describe('ScheduleBulkBar wiring (MYK9-1352)', () => {
  beforeEach(() => {
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [] });
    applyManualClassStatus.mockReset().mockResolvedValue(undefined);
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
    toastMocks.info.mockReset();
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 0,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset();
  });

  it("a bulk delete hands the purge the class's own trial, though the bar's context names none", async () => {
    const { user } = renderCockpit();
    await user.click(screen.getByRole('button', { name: /^Expand 2 / }));
    await user.click(tick('Buried Novice'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(deleteMocks.purge).toHaveBeenCalledTimes(1));
    expect(deleteMocks.purge).toHaveBeenCalledWith(
      'class',
      expect.objectContaining({
        id: 'class-9',
        context: expect.objectContaining({
          showId: 'show-1',
          trialId: 'trial-2',
          classId: 'class-9',
        }),
      })
    );
  });

  it('Retry failed still reaches a failed class that a schedule filter has since hidden', async () => {
    applyManualClassStatus.mockRejectedValueOnce(new Error('offline'));
    const { user } = renderCockpit();
    await user.click(tick('Container Novice'));

    await user.click(screen.getByRole('button', { name: 'Change status' }));
    await user.click((await screen.findAllByRole('menuitem'))[0]!);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(1));
    expect(applyManualClassStatus).toHaveBeenCalledTimes(1);
    const [, status] = applyManualClassStatus.mock.calls[0]!;

    // The In progress filter hides Container Novice (not started) and drops its tick.
    await user.click(screen.getByRole('combobox', { name: 'Show: Schedule filters' }));
    await user.click(await screen.findByRole('option', { name: /^In progress/ }));
    expect(screen.queryByRole('checkbox', { name: 'Select Container Novice' })).toBeNull();

    const options = toastMocks.error.mock.calls[0]![1] as {
      action: { label: string; onClick: (event: unknown) => void };
    };
    expect(options.action.label).toBe('Retry failed');
    options.action.onClick({ defaultPrevented: false, preventDefault: vi.fn() });

    await waitFor(() => expect(applyManualClassStatus).toHaveBeenCalledTimes(2));
    expect(applyManualClassStatus).toHaveBeenLastCalledWith('class-1', status);
  });
});
