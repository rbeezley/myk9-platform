import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatesEntrySection } from '../sections/DatesEntrySection';
import TrialConfigurationStep from '../TrialConfigurationStep';
import { getDefaultTrialDateTime } from '../TrialConfigurationStep.helpers';
import { useWizardStore } from '@/store/wizardStore';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { format } from 'date-fns';

function DatesHarness() {
  const { show, updateShowData } = useWizardStore();
  return <DatesEntrySection show={show} dateRangeValid entryDatesValid onUpdate={updateShowData} />;
}

function TrialsHarness() {
  const trials = useWizardStore(state => state.trials);
  const trialView = createWizardTrialView(
    trials.map(trial => ({
      id: trial.id,
      trialDate: trial.dateTime,
      nameOverride: trial.nameOverride,
    })),
    []
  );
  return <TrialConfigurationStep trialView={trialView} />;
}

/** Click a visible (non-outside) day in the Nth calendar pane of the open dialog. */
async function clickDay(user: ReturnType<typeof userEvent.setup>, pane: number, day: number) {
  const grid = screen.getAllByRole('grid')[pane]!;
  const cell = within(grid)
    .getAllByRole('gridcell')
    .find(c => c.textContent === String(day) && c.getAttribute('data-outside') !== 'true');
  await user.click(within(cell!).getByRole('button'));
}

const ymd = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

describe('show dates and trial default (MYK9-884, MYK9-892, MYK9-888)', () => {
  beforeEach(() => {
    // Pin "today" so the pickers open on August 2026 and dates are literals.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('picks a same-month range entirely in the first calendar', async () => {
    const user = userEvent.setup();
    render(<DatesHarness />);
    await user.click(await screen.findByRole('button', { name: /show dates/i }));
    await clickDay(user, 0, 12);
    await clickDay(user, 0, 13);

    const { startDate, endDate } = useWizardStore.getState().show;
    expect(ymd(startDate)).toBe('2026-08-12');
    expect(ymd(endDate)).toBe('2026-08-13');
  });

  it('picks a cross-month range from the first calendar into the second', async () => {
    const user = userEvent.setup();
    render(<DatesHarness />);
    await user.click(await screen.findByRole('button', { name: /show dates/i }));
    await clickDay(user, 0, 27);
    await clickDay(user, 1, 3);

    const { startDate, endDate } = useWizardStore.getState().show;
    expect(ymd(startDate)).toBe('2026-08-27');
    expect(ymd(endDate)).toBe('2026-09-03');
  });

  it('defaults the first trial to the clicked one-day show date, not the entry period', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DatesHarness />);
    await user.click(await screen.findByRole('button', { name: /^show dates/i }));
    await clickDay(user, 0, 15);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /^entry period/i }));
    await clickDay(user, 0, 3);
    await clickDay(user, 0, 5);
    await user.click(screen.getByRole('button', { name: 'Done' }));

    const { show } = useWizardStore.getState();
    // One click is a one-day range: both ends are the clicked literal day.
    expect(ymd(show.startDate)).toBe('2026-08-15');
    expect(ymd(show.endDate)).toBe('2026-08-15');
    expect(ymd(show.entryOpenDate)).toBe('2026-08-03');
    expect(ymd(show.entryCloseDate)).toBe('2026-08-05');
    unmount();

    render(<TrialsHarness />);
    await user.click((await screen.findAllByRole('button', { name: 'Add First Trial' }))[0]!);

    expect(useWizardStore.getState().trials.map(t => t.dateTime)).toEqual(['2026-08-15T08:00:00']);
  });

  it('tells the user what Add Another Trial and Next do, on the Add button itself', async () => {
    const user = userEvent.setup();
    useWizardStore.getState().updateShowData({
      startDate: new Date(2026, 7, 14, 8).toISOString(),
      endDate: new Date(2026, 7, 15, 17).toISOString(),
      entryOpenDate: new Date(2026, 6, 1, 8).toISOString(),
      entryCloseDate: new Date(2026, 7, 5, 23).toISOString(),
    });
    render(<TrialsHarness />);

    const first = (await screen.findAllByRole('button', { name: 'Add First Trial' }))[0]!;
    expect(first).not.toHaveAccessibleDescription(/Use Next/);
    await user.click(first);

    const add = screen.getAllByRole('button', { name: 'Add Another Trial' })[0]!;
    expect(add).toHaveAccessibleDescription(
      'Add Another Trial adds a trial on another day. Use Next when all your trials are listed.'
    );

    await user.click(add);
    await user.click(screen.getAllByRole('button', { name: 'Add Another Trial' })[0]!);
    expect(useWizardStore.getState().trials.map(t => t.dateTime.slice(0, 10))).toEqual([
      '2026-08-14',
      '2026-08-14',
      '2026-08-15',
    ]);
  });

  it('says when trial dates were moved, and stops saying so after an edit', async () => {
    const user = userEvent.setup();
    const store = useWizardStore.getState();
    store.updateShowData({
      startDate: new Date(2026, 6, 1, 8).toISOString(),
      endDate: new Date(2026, 6, 1, 17).toISOString(),
    });
    store.addTrial({
      nameOverride: undefined,
      dateTime: '2026-07-01T08:00:00',
      eventNumber: '',
      classes: [],
    });
    store.updateShowData({ startDate: new Date(2026, 7, 15, 8).toISOString() });
    store.updateShowData({ endDate: new Date(2026, 7, 15, 17).toISOString() });
    useWizardStore.getState().setCurrentStep(1);

    render(<TrialsHarness />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'We moved 1 trial date to match the new show dates.'
    );

    await user.type(screen.getByLabelText(/^Event Number/), '1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps spreading default trials when the show has no end date yet', () => {
    const start = new Date(2026, 7, 14, 8).toISOString();
    const existing = ['2026-08-14T08:00:00', '2026-08-14T09:00:00'];

    expect(getDefaultTrialDateTime(start, '', existing)).toBe('2026-08-15T08:00:00');
  });
});
