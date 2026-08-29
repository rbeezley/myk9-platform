import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SelfCheckinTool } from './SelfCheckinTool';

const queryState = vi.hoisted(() => ({
  settings: {
    data: {
      visibility: {
        placement: 'class_complete',
        qualification: 'immediate',
        time: 'class_complete',
        faults: 'class_complete',
        preset: 'standard',
        inheritedFrom: 'show',
      },
      selfCheckinEnabled: true,
      hasExplicitSettings: true,
    } as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  trials: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
  classes: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
}));

const bulkMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useShowSettingsDatabase', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/queries/useShowSettingsDatabase')>();
  return {
    ...actual,
    useShowSettings: () => queryState.settings,
    useTrialOverrides: () => queryState.trials,
    useClassOverrides: () => queryState.classes,
  };
});

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowCheckin: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTrialOverride: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateClassOverride: () => ({ mutate: vi.fn(), isPending: false }),
  useResetOverride: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkUpdateClassOverrides: () => ({ mutate: bulkMutate, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const trials = [{ id: 'trial-1', name: 'Trial A' }];
const classes = [
  { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice', section: 'A' },
  { id: 'class-2', trialId: 'trial-1', element: 'Container', level: 'Novice', section: 'B' },
];

describe('SelfCheckinTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.settings.data = {
      visibility: {
        placement: 'class_complete',
        qualification: 'immediate',
        time: 'class_complete',
        faults: 'class_complete',
        preset: 'standard',
        inheritedFrom: 'show',
      },
      selfCheckinEnabled: true,
      hasExplicitSettings: true,
    };
    queryState.settings.isLoading = false;
    queryState.settings.isError = false;
    queryState.trials.data = [];
    queryState.trials.isLoading = false;
    queryState.trials.isError = false;
    queryState.classes.data = [];
    queryState.classes.isLoading = false;
    queryState.classes.isError = false;
  });

  it('renders the saved check-in cascade without result visibility controls', async () => {
    const { user } = render(
      <SelfCheckinTool showId="show-1" trials={trials} classes={classes} />
    );

    expect(screen.getByRole('switch', { name: 'Allow self check-in for show' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Self check-in for Trial A' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
    expect(screen.getByText('Container Novice B')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Results visibility/ })).not.toBeInTheDocument();
  });

  it('bulk-enables self check-in for selected valid classes', async () => {
    const { user } = render(<SelfCheckinTool showId="show-1" trials={trials} classes={classes} />);
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Container Novice A' }));
    await user.click(screen.getByRole('button', { name: 'Enable self check-in' }));

    expect(bulkMutate).toHaveBeenCalledWith(
      { classIds: ['class-1'], showId: 'show-1', selfCheckinEnabled: true },
      expect.any(Object)
    );
  });

  it('clears a stale selection instead of mutating a class outside the current list', async () => {
    const { user, rerender } = render(
      <SelfCheckinTool showId="show-1" trials={trials} classes={classes} />
    );
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Container Novice A' }));

    rerender(<SelfCheckinTool showId="show-1" trials={trials} classes={[]} />);

    expect(bulkMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('1 class selected')).not.toBeInTheDocument();
  });

  it('shows loading without presenting defaults as saved settings', () => {
    queryState.settings.data = undefined;
    queryState.settings.isLoading = true;

    render(<SelfCheckinTool showId="show-1" trials={trials} classes={classes} />);

    expect(screen.getByTestId('self-checkin-loading')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Allow self check-in for show' })
    ).not.toBeInTheDocument();
  });

  it('settles a failed read with retry while keeping the failure local to the tool', async () => {
    queryState.settings.data = undefined;
    queryState.settings.isError = true;

    const { user } = render(
      <div>
        <p>Show Desk remains available</p>
        <SelfCheckinTool showId="show-1" trials={trials} classes={classes} />
      </div>
    );

    expect(screen.getByText("Couldn't load self check-in settings.")).toBeInTheDocument();
    expect(screen.getByText('Show Desk remains available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry self check-in settings' }));
    expect(queryState.settings.refetch).toHaveBeenCalled();
    expect(queryState.trials.refetch).toHaveBeenCalled();
    expect(queryState.classes.refetch).toHaveBeenCalled();
  });

  it('treats a settled read without data as unavailable, not as confirmed defaults', () => {
    queryState.settings.data = undefined;

    render(<SelfCheckinTool showId="show-1" trials={trials} classes={classes} />);

    expect(screen.getByText("Couldn't load self check-in settings.")).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Allow self check-in for show' })
    ).not.toBeInTheDocument();
  });

  it('keeps cached controls visible when a background refresh fails', async () => {
    queryState.settings.isError = true;

    const { user } = render(
      <SelfCheckinTool showId="show-1" trials={trials} classes={classes} />
    );

    expect(screen.getByRole('switch', { name: 'Allow self check-in for show' })).toBeChecked();
    expect(screen.getByText(/saved settings shown below may be out of date/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry self check-in settings' }));
    expect(queryState.settings.refetch).toHaveBeenCalled();
  });
});
