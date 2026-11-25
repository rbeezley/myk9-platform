/**
 * MYK9-2379: Edit class opened from Show Desk holds the class settings (status, judge, scoring,
 * expected start, stewards). Those save themselves, so the panel's own Status gives way to them
 * and Save Changes never writes status or judge back from the form's older copy.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import { timeLimitPatch, withoutLiveSettings } from '../ClassEditPanel.helpers';
import type { TrialClassEditFormData } from '../ClassEditPanel.types';
import type { ClassData } from '@/components/classes/types/classTypes';

vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

const fullClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Exterior',
    level: 'Excellent',
    section: 'A',
    judgeId: 'judge-1',
    judge: 'Jane Judge',
    status: 'Scheduled',
    classOrder: '1',
    estimatedJudgingTime: '5:00',
    timeLimit1: '3:00',
    ...extra,
  }) as Partial<ClassData>;

// Show Desk's class carries a judge and no estimatedJudgingTime, so the panel renders its simple
// form: the shape Edit class really opens with.
const simpleClass = () => ({
  id: 'cls-1',
  element: 'Exterior',
  level: 'Excellent',
  section: '',
  judgeId: 'judge-1',
  judgeName: 'Jane Judge',
  status: 'Upcoming',
  entries: 4,
});

function renderPanel(
  liveSettings?: React.ReactNode,
  initial: Partial<ClassData> = fullClass(),
  liveJudge = false
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Exterior Excellent"
      initialClassData={initial}
      onSave={onSave}
      liveSettings={liveSettings}
      liveJudge={liveJudge}
    />
  );
  return { ...view, onSave };
}

describe('ClassEditPanel with Show Desk class settings', () => {
  it('shows the settings first on the Basic tab, in place of its own Status field', async () => {
    renderPanel(<span>Settings from Show Desk</span>);

    const card = await screen.findByTestId('class-live-settings');
    expect(within(card).getByText('Settings from Show Desk')).toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('keeps its own Status field when opened without them (Class Details, Setup)', async () => {
    renderPanel();

    expect(await screen.findByText('Basic Information')).toBeInTheDocument();
    expect(screen.queryByTestId('class-live-settings')).not.toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('saves only what this form changed: not the status or judge it opened with', async () => {
    const { user, onSave } = renderPanel(<span>Settings</span>);
    await user.click(await screen.findByRole('tab', { name: /Timing/ }));
    const limit = screen.getByLabelText('Time Limit 1');
    await user.clear(limit);
    await user.type(limit, '430');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toEqual(expect.objectContaining({ timeLimit1: '4:30' }));
    for (const key of ['status', 'judge', 'judgeId', 'judgeName']) {
      expect(patch).not.toHaveProperty(key);
    }
  });

  it('lets an Exterior Excellent time limit be edited (the judge sets it)', async () => {
    const { user } = renderPanel(<span>Settings</span>);
    await user.click(await screen.findByRole('tab', { name: /Timing/ }));

    const limit = screen.getByLabelText('Time Limit 1');
    expect(limit).toBeEnabled();
    expect(limit).not.toHaveAttribute('readonly');
  });

  it('still writes status and judge when opened without the settings', async () => {
    const { user, onSave } = renderPanel();
    await user.click(await screen.findByRole('tab', { name: /Timing/ }));
    const limit = screen.getByLabelText('Time Limit 1');
    await user.clear(limit);
    await user.type(limit, '430');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Scheduled', judgeId: 'judge-1' })
    );
  });
});

describe('ClassEditPanel with Show Desk class settings, simple form', () => {
  const simple = (extra: Record<string, unknown> = {}) =>
    ({ ...simpleClass(), ...extra }) as unknown as Partial<ClassData>;

  it('says "Show day" and that changes save right away, in place of the form own Status', async () => {
    renderPanel(<span>Settings from Show Desk</span>, simple(), true);

    const card = await screen.findByTestId('class-live-settings');
    expect(within(card).getByText('Show day')).toBeInTheDocument();
    expect(within(card).getByText('Changes here save right away.')).toBeInTheDocument();
    expect(within(card).getByText('Settings from Show Desk')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('shows one Judge: the form field is hidden while the live control holds it', async () => {
    renderPanel(<span>Settings from Show Desk</span>, simple(), true);

    await screen.findByTestId('class-live-settings');
    expect(screen.queryByText('Judge')).not.toBeInTheDocument();
  });

  it('shows the form Judge field when the live control is not offered (a started class)', async () => {
    renderPanel(<span>Settings from Show Desk</span>, simple(), false);

    await screen.findByTestId('class-live-settings');
    expect(screen.getByText('Judge')).toBeInTheDocument();
  });

  it('keeps its own Status and Judge when opened without the settings', async () => {
    renderPanel(undefined, simple());

    expect(await screen.findByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Judge')).toBeInTheDocument();
    expect(screen.queryByTestId('class-live-settings')).not.toBeInTheDocument();
  });

  it('lets an Exterior time limit be edited and saves it, with no status or judge', async () => {
    const { user, onSave } = renderPanel(
      <span>Settings</span>,
      simple({ timeLimit1: '3:00' }),
      true
    );
    const limit = await screen.findByLabelText('Time Limit 1');
    expect(limit).toBeEnabled();
    await user.clear(limit);
    await user.type(limit, '430');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toEqual(expect.objectContaining({ timeLimit1: '4:30' }));
    for (const key of ['status', 'judge', 'judgeId', 'judgeName']) {
      expect(patch).not.toHaveProperty(key);
    }
  });

  it('shows Interior Excellent areas 1 and 2, editable', async () => {
    renderPanel(
      <span>Settings</span>,
      simple({ element: 'Interior', level: 'Excellent', timeLimit1: '3:00', timeLimit2: '4:00' }),
      true
    );

    expect(await screen.findByLabelText('Time Limit 1')).toBeEnabled();
    expect(screen.getByLabelText('Time Limit 2')).toHaveValue('4:00');
    expect(screen.queryByLabelText('Time Limit 3')).not.toBeInTheDocument();
  });

  it.each(['Container', 'Buried'])(
    'shows a %s time limit as fixed, with nothing to edit',
    async element => {
      renderPanel(<span>Settings</span>, simple({ element, timeLimit1: '3:00' }), true);

      const fixed = await screen.findByTestId('class-time-limit-fixed');
      expect(fixed).toHaveTextContent('3:00');
      expect(screen.queryByLabelText('Time Limit 1')).not.toBeInTheDocument();
    }
  );

  it('shows no time limit for a class whose source did not carry it', async () => {
    renderPanel(<span>Settings</span>, simpleClass() as unknown as Partial<ClassData>, true);

    await screen.findByTestId('class-live-settings');
    expect(screen.queryByLabelText('Time Limit 1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('class-time-limit-fixed')).not.toBeInTheDocument();
  });
});

describe('withoutLiveSettings', () => {
  const patch = { status: 'Scheduled', judge: 'Jane', judgeId: 'j1', judgeName: 'Jane', x: 1 };

  it('drops status and the judge, which saved themselves', () => {
    expect(withoutLiveSettings(patch, { keepJudge: false })).toEqual({ x: 1 });
  });

  it('keeps a judge picked in the form, but never the status', () => {
    expect(withoutLiveSettings(patch, { keepJudge: true })).toEqual({
      judge: 'Jane',
      judgeId: 'j1',
      judgeName: 'Jane',
      x: 1,
    });
  });
});

describe('timeLimitPatch', () => {
  const form = {
    timeLimit1: '3:00',
    timeLimit2: '',
    timeLimit3: '',
  } as unknown as TrialClassEditFormData;

  it('sends nothing for limits nobody touched', () => {
    expect(timeLimitPatch({ ...form, timeLimitEdited: false })).toEqual({});
  });

  it('sends the limits once one was changed', () => {
    expect(timeLimitPatch({ ...form, timeLimitEdited: true })).toEqual({
      timeLimit1: '3:00',
      timeLimit2: '',
      timeLimit3: '',
    });
  });
});
