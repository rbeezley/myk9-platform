import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';

import { STATUS_TIMING_HELP } from './ClassOperationalControls';
import { FocusedClassFields } from './FocusedClassFields';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
}));
vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const trial: SecretaryCockpitTrial = { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 };

const baseFocused = {
  id: 'class-1',
  name: 'Container Novice',
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  actualStart: { evidence: 'unknown', value: null },
  actualFinish: { evidence: 'unknown', value: null },
} as unknown as FocusedClassModel;

const baseSource = {
  id: 'class-1',
  scheduledStart: '9:00 AM',
  lifecycle: 'not-started',
} as unknown as SecretaryCockpitClass;

function renderFields(
  props: {
    focused?: Partial<FocusedClassModel>;
    source?: Partial<SecretaryCockpitClass>;
    canManageShow?: boolean;
    judgeControl?: React.ReactNode;
  } = {}
) {
  const onEditActualStart = vi.fn();
  render(
    <FocusedClassFields
      focused={{ ...baseFocused, ...props.focused }}
      sourceClass={{ ...baseSource, ...props.source }}
      trial={trial}
      timeZone="America/Chicago"
      canManageShow={props.canManageShow ?? true}
      judgeControl={props.judgeControl}
      onEditActualStart={onEditActualStart}
    />
  );
  return { onEditActualStart };
}

// A submenu parks pointer-events: none on its parent while open, which user-event would refuse.
const statusUser = () => userEvent.setup({ pointerEventsCheck: 0 });
const openStatus = (user: ReturnType<typeof statusUser>) =>
  user.click(screen.getByRole('button', { name: /^Status: .*Change status of Container Novice$/ }));

describe('FocusedClassFields (MYK9-1867)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows all four fields, with the judge control the cockpit supplies', () => {
    renderFields({ judgeControl: <span>Judge Judy</span> });

    for (const label of ['Status', 'Judge', 'Expected start', 'Actual timing']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Judge Judy')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Actual timing: .*Edit actual start$/ })
    ).toHaveTextContent('Not started');
  });

  it('is read-only for someone who cannot manage the show', () => {
    renderFields({ canManageShow: false });

    expect(screen.getByText('Not started', { selector: 'span.rounded-full' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Change status/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Actual timing: .*Edit actual start$/ })
    ).toBeNull();
    expect(screen.getByRole('button', { name: /9:00/ })).toBeDisabled();
  });

  it.each([
    ['not-started', 'Not started'],
    ['in-progress', 'In progress'],
    ['complete', 'Complete'],
  ] as const)(
    'shows a %s class as the one status that cannot be picked again',
    async (lifecycle, label) => {
      renderFields({ focused: { lifecycle: { evidence: 'recorded', value: lifecycle } } });
      const user = statusUser();
      await openStatus(user);

      expect(await screen.findByRole('menuitem', { name: label })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(screen.getByRole('menuitem', { name: 'Cancelled' })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }
  );

  it('applies a routine status change straight away', async () => {
    renderFields();
    const user = statusUser();
    await openStatus(user);
    await user.click(await screen.findByRole('menuitem', { name: 'In progress' }));

    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.IN_PROGRESS);
  });

  it('explains the timing, and keeps Cancelled apart from the routine statuses', async () => {
    renderFields({ focused: { lifecycle: { evidence: 'recorded', value: 'in-progress' } } });
    const user = statusUser();
    await openStatus(user);

    const cancelled = await screen.findByRole('menuitem', { name: 'Cancelled' });
    expect(screen.getByText(STATUS_TIMING_HELP)).toBeInTheDocument();
    expect(cancelled).toHaveClass('text-destructive');
    expect(
      within(cancelled.closest('[role="menu"]') as HTMLElement).getByRole('separator')
    ).toBeInTheDocument();
  });

  it('confirms Complete over unentered scores, and writes only once confirmed', async () => {
    renderFields({
      focused: {
        lifecycle: { evidence: 'recorded', value: 'in-progress' },
        progress: { evidence: 'computed', value: { completed: 6, total: 8 } },
      },
    });
    const user = statusUser();
    await openStatus(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('2 paper scores still need entry. Mark this Class complete anyway?')
    ).toBeInTheDocument();
    expect(applyManualClassStatus).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Mark complete' }));
    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.COMPLETED);
  });

  it('writes nothing when the Complete confirmation is cancelled', async () => {
    renderFields({
      focused: {
        lifecycle: { evidence: 'recorded', value: 'in-progress' },
        progress: { evidence: 'unknown', value: null },
      },
    });
    const user = statusUser();
    await openStatus(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^Entry data is unavailable/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(applyManualClassStatus).not.toHaveBeenCalled();
  });

  it('asks before cancelling, naming the class', async () => {
    renderFields({ focused: { lifecycle: { evidence: 'recorded', value: 'in-progress' } } });
    const user = statusUser();
    await openStatus(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Cancelled' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Cancel this class?')).toBeInTheDocument();
    expect(applyManualClassStatus).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel class' }));
    expect(applyManualClassStatus).toHaveBeenCalledWith('class-1', CLASS_STATUS.CANCELLED);
  });

  it('edits the expected start in place and writes through the existing editor', async () => {
    renderFields({ source: { revisedExpectedStart: '2026-07-20T15:15:00.000Z' } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Expected start: .*10:15/ }));
    await user.click(screen.getByRole('button', { name: 'Use scheduled time' }));

    expect(setRevisedExpectedStart).toHaveBeenCalledWith('class-1', null);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Use scheduled time' })).toBeNull()
    );
  });

  it('names the visible status and time first, so screen readers and voice control hear them', () => {
    renderFields();

    expect(
      screen.getByRole('button', { name: 'Status: Not started. Change status of Container Novice' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actual timing: Not started. Edit actual start' })
    ).toBeInTheDocument();
  });

  it('returns focus to the expected start opener when the editor closes', async () => {
    renderFields();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Expected start: / }));
    await user.click(screen.getByRole('button', { name: 'Cancel expected start edit' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Expected start: / })).toHaveFocus()
    );
  });

  it('opens the one actual-start editor from the Actual timing field', async () => {
    const { onEditActualStart } = renderFields();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Actual timing: .*Edit actual start$/ }));

    expect(onEditActualStart).toHaveBeenCalledTimes(1);
  });

  it('does not offer the actual-start editor on a cancelled class, which has none', () => {
    renderFields({
      focused: { lifecycle: { evidence: 'recorded', value: 'cancelled' } },
      source: { lifecycle: 'cancelled' },
    });

    expect(
      screen.queryByRole('button', { name: /^Actual timing: .*Edit actual start$/ })
    ).toBeNull();
  });

  it('says a class that ran has no recorded start, and shows started and finished times', () => {
    renderFields({
      canManageShow: false,
      source: { lifecycle: 'complete' },
      focused: { actualFinish: { evidence: 'recorded', value: '2026-07-20T17:30:00.000Z' } },
    });
    expect(screen.getByText(/^Start not recorded · Finished 12:30/)).toBeInTheDocument();
  });
});
