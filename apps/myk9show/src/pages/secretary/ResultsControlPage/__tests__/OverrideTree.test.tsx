import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { replicatedToClass } from '@/store/class-store-helpers';
import { OverrideTree } from '../OverrideTree';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';

const mockTrialMutate = vi.fn();
const mockClassMutate = vi.fn();
const mockResetMutate = vi.fn();

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateTrialOverride: () => ({ mutate: mockTrialMutate, isPending: false }),
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockNetworkState = vi.hoisted(() => ({ isOnline: true }));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkState,
}));

const settings: ShowSettings = {
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

const trials: SyncableTrial[] = [
  { id: 'trial-1', name: 'Trial A', showId: 'show-1' } as SyncableTrial,
];

const classes: SyncableClassData[] = [
  { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as SyncableClassData,
  { id: 'class-2', trialId: 'trial-1', element: 'Interior', level: 'Open' } as SyncableClassData,
];

function renderTree(opts?: {
  facet?: 'visibility' | 'checkin';
  trialOverrides?: TrialOverrideEntry[];
  classOverrides?: ClassOverrideEntry[];
  selectedClasses?: Set<string>;
  onToggleClass?: (id: string) => void;
  onToggleAllInTrial?: (trialId: string, ids: string[]) => void;
  classes?: SyncableClassData[];
}) {
  return render(
    <OverrideTree
      facet={opts?.facet ?? 'visibility'}
      showId="show-1"
      settings={settings}
      trials={trials}
      classes={opts?.classes ?? classes}
      trialOverrides={opts?.trialOverrides ?? []}
      classOverrides={opts?.classOverrides ?? []}
      selectedClasses={opts?.selectedClasses ?? new Set()}
      onToggleClass={opts?.onToggleClass ?? vi.fn()}
      onToggleAllInTrial={opts?.onToggleAllInTrial ?? vi.fn()}
    />
  );
}

describe('OverrideTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkState.isOnline = true;
  });

  it('renders only visibility controls in visibility mode', () => {
    renderTree();
    expect(
      screen.getByRole('combobox', { name: 'Results visibility for Trial A' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Self check-in for Trial A' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Check-in:/)).not.toBeInTheDocument();
  });

  it('renders only check-in controls in check-in mode', () => {
    renderTree({ facet: 'checkin' });
    expect(screen.getByRole('switch', { name: 'Self check-in for Trial A' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Results visibility for Trial A' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Visibility:/)).not.toBeInTheDocument();
  });

  it('dispatches a trial check-in update when the trial switch is toggled', async () => {
    const { user } = renderTree({ facet: 'checkin' });
    await user.click(screen.getByRole('switch', { name: 'Self check-in for Trial A' }));
    expect(mockTrialMutate).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 'trial-1', showId: 'show-1', selfCheckinEnabled: false }),
      expect.any(Object)
    );
  });

  it('shows only the active facet status', () => {
    renderTree({
      trialOverrides: [
        { trialId: 'trial-1', override: { preset: 'review' }, selfCheckinEnabled: null },
      ],
    });
    expect(screen.getByText(/Visibility: Override: review/)).toBeInTheDocument();
    expect(screen.queryByText(/Check-in:/)).not.toBeInTheDocument();

    renderTree({
      facet: 'checkin',
      trialOverrides: [
        { trialId: 'trial-1', override: { preset: 'review' }, selfCheckinEnabled: null },
      ],
    });
    expect(screen.getByText(/Check-in: Inheriting from show/)).toBeInTheDocument();
  });

  it('shows the inherited preset label for visibility inherited from the show', async () => {
    const { user } = renderTree({
      trialOverrides: [{ trialId: 'trial-1', override: {}, selfCheckinEnabled: false }],
    });

    expect(screen.getByText(/Visibility: Inheriting from show · After Class/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    expect(screen.getAllByText(/Visibility: Inheriting from show · After Class/)).toHaveLength(3);
  });

  it('visibility mode exposes only the visibility reset', async () => {
    const { user } = renderTree({
      // Both facets overridden at trial → both reset buttons visible.
      trialOverrides: [
        { trialId: 'trial-1', override: { preset: 'review' }, selfCheckinEnabled: false },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Reset visibility for Trial A' }));
    expect(mockResetMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityId: 'trial-1', level: 'trial', facet: 'visibility' }),
      expect.any(Object)
    );

    expect(
      screen.queryByRole('button', { name: 'Reset check-in for Trial A' })
    ).not.toBeInTheDocument();
  });

  it('expands to class rows and dispatches class-level check-in with facet-independent reset', async () => {
    const { user } = renderTree({
      facet: 'checkin',
      classOverrides: [
        { classId: 'class-1', trialId: 'trial-1', override: {}, selfCheckinEnabled: false },
      ],
    });
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));

    // Class-level reset offered only for check-in (only facet overridden).
    await user.click(screen.getByRole('button', { name: 'Reset check-in for Container Novice' }));
    expect(mockResetMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityId: 'class-1', level: 'class', facet: 'checkin' }),
      expect.any(Object)
    );
  });

  it('MYK9-1049: labels each class row with the full class label, section included', async () => {
    const { user } = renderTree({
      classes: [
        {
          id: 'class-a',
          trialId: 'trial-1',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          className: 'Novice',
        } as SyncableClassData,
        {
          id: 'class-b',
          trialId: 'trial-1',
          element: 'Container',
          level: 'Novice',
          section: 'B',
          className: 'Novice',
        } as SyncableClassData,
      ],
    });
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
    expect(screen.getByText('Container Novice B')).toBeInTheDocument();
    expect(screen.queryByText('Novice', { exact: true })).not.toBeInTheDocument();
  });

  it('MYK9-1049: tells two same-element same-level classes apart by their stored name', async () => {
    const { user } = renderTree({
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          element: 'Interior',
          level: 'Advanced',
          className: 'Interior Advanced',
        } as SyncableClassData,
        {
          id: 'class-2',
          trialId: 'trial-1',
          element: 'Interior',
          level: 'Advanced',
          className: 'Interior Advanced Preliminary',
        } as SyncableClassData,
      ],
    });
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    expect(screen.getByText('Interior Advanced Preliminary')).toBeInTheDocument();
  });

  it('MYK9-1049: labels a class from the real store mapping with element and section', async () => {
    const { user } = renderTree({
      classes: [
        replicatedToClass({
          id: 'class-a',
          trialId: 'trial-1',
          name: 'Novice',
          level: 'Novice',
          element: 'Container',
          section: 'A',
        }),
      ],
    });
    await user.click(screen.getByRole('button', { name: /Trial A.*class/ }));
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it.each(['visibility', 'checkin'] as const)(
    'fires bulk-selection callbacks in %s mode',
    async facet => {
      const onToggleClass = vi.fn();
      const onToggleAllInTrial = vi.fn();
      const { user } = renderTree({ facet, onToggleClass, onToggleAllInTrial });
      await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));

      await user.click(screen.getByRole('checkbox', { name: 'Select all classes in Trial A' }));
      expect(onToggleAllInTrial).toHaveBeenCalledWith('trial-1', ['class-1', 'class-2']);

      await user.click(screen.getByRole('checkbox', { name: 'Select Container Novice' }));
      expect(onToggleClass).toHaveBeenCalledWith('class-1');
    }
  );

  it('every switch is named and wrapped in a ≥44px tap row; reset is 44px', async () => {
    const { user } = renderTree({
      facet: 'checkin',
      trialOverrides: [
        { trialId: 'trial-1', override: { preset: 'review' }, selfCheckinEnabled: false },
      ],
    });
    const trialSwitch = screen.getByRole('switch', { name: 'Self check-in for Trial A' });
    const tapRow = trialSwitch.closest('label');
    expect(tapRow).toHaveClass('min-h-[44px]', 'min-w-[44px]');

    const reset = screen.getByRole('button', { name: 'Reset check-in for Trial A' });
    expect(reset).toHaveClass('h-11', 'w-11', 'min-h-[44px]', 'min-w-[44px]');

    // Class-level switches are also named.
    await user.click(screen.getByRole('button', { name: /Trial A.*classes/ }));
    expect(
      within(document.body).getAllByRole('switch', { name: /^Self check-in for /i }).length
    ).toBeGreaterThan(1);
  });

  it('lets row labels and override controls wrap before they clip on mobile', async () => {
    const { user } = renderTree();

    const trialToggle = screen.getByRole('button', { name: /Trial A.*classes/ });
    const trialRow = trialToggle.parentElement;
    expect(trialRow).toHaveClass('flex-col', 'sm:flex-row');

    const trialControls = screen
      .getByRole('combobox', { name: 'Results visibility for Trial A' })
      .closest('div');
    expect(trialControls).toHaveClass(
      'w-full',
      'flex-wrap',
      'justify-start',
      'sm:flex-nowrap',
      'sm:justify-end',
      'sm:w-auto'
    );
    expect(trialControls).not.toHaveClass('overflow-x-auto');
    expect(screen.getByRole('combobox', { name: 'Results visibility for Trial A' })).toHaveClass(
      'w-32',
      'shrink-0'
    );

    await user.click(trialToggle);
    const classCheckbox = screen.getByRole('checkbox', { name: 'Select Container Novice' });
    const classRow = classCheckbox.closest('.rounded-md');
    expect(classRow).toHaveClass('flex-col', 'sm:flex-row');
  });

  describe('offline (MYK9-849)', () => {
    beforeEach(() => {
      mockNetworkState.isOnline = false;
    });

    it('disables the visibility preset select and shows a "Needs a connection" hint', () => {
      renderTree();
      const combobox = screen.getByRole('combobox', { name: 'Results visibility for Trial A' });
      expect(combobox).toBeDisabled();
      expect(combobox).toHaveAttribute('aria-describedby', 'override-tree-connection-hint');
      expect(screen.getByText(/Needs a connection/)).toBeInTheDocument();
    });

    it('disables the check-in switch and reset button, swapping the reset title to the hint', async () => {
      const { user } = renderTree({
        facet: 'checkin',
        trialOverrides: [
          { trialId: 'trial-1', override: { preset: 'review' }, selfCheckinEnabled: false },
        ],
      });
      const trialSwitch = screen.getByRole('switch', { name: 'Self check-in for Trial A' });
      expect(trialSwitch).toHaveAttribute('aria-disabled', 'true');
      expect(trialSwitch).toHaveAttribute('aria-describedby', 'override-tree-connection-hint');

      const resetButton = screen.getByRole('button', { name: 'Reset check-in for Trial A' });
      expect(resetButton).toBeDisabled();
      expect(resetButton).toHaveAttribute('title', 'Needs a connection');

      // A click on a disabled switch dispatches nothing.
      await user.click(trialSwitch);
      expect(mockTrialMutate).not.toHaveBeenCalled();
    });

    it('re-enables controls once back online', () => {
      const { rerender } = renderTree();
      expect(
        screen.getByRole('combobox', { name: 'Results visibility for Trial A' })
      ).toBeDisabled();

      mockNetworkState.isOnline = true;
      rerender(
        <OverrideTree
          facet="visibility"
          showId="show-1"
          settings={settings}
          trials={trials}
          classes={classes}
          trialOverrides={[]}
          classOverrides={[]}
          selectedClasses={new Set()}
          onToggleClass={vi.fn()}
          onToggleAllInTrial={vi.fn()}
        />
      );
      expect(
        screen.getByRole('combobox', { name: 'Results visibility for Trial A' })
      ).not.toBeDisabled();
      expect(screen.queryByText(/Needs a connection/)).not.toBeInTheDocument();
    });
  });
});
