import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DatesEntrySection } from '../sections/DatesEntrySection';
import TrialConfigurationStep from '../TrialConfigurationStep';
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

const dayKey = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

describe('show dates and trial default (MYK9-884, MYK9-892, MYK9-888)', () => {
  it('picks a same-month range entirely in the first calendar', async () => {
    const user = userEvent.setup();
    render(<DatesHarness />);
    await user.click(await screen.findByRole('button', { name: /show dates/i }));
    await clickDay(user, 0, 12);
    await clickDay(user, 0, 13);

    const { startDate, endDate } = useWizardStore.getState().show;
    expect(format(new Date(startDate), 'd')).toBe('12');
    expect(format(new Date(endDate), 'd')).toBe('13');
    expect(format(new Date(startDate), 'yyyy-MM')).toBe(format(new Date(endDate), 'yyyy-MM'));
  });

  it('picks a cross-month range from the first calendar into the second', async () => {
    const user = userEvent.setup();
    render(<DatesHarness />);
    await user.click(await screen.findByRole('button', { name: /show dates/i }));
    await clickDay(user, 0, 27);
    await clickDay(user, 1, 3);

    const { startDate, endDate } = useWizardStore.getState().show;
    expect(format(new Date(startDate), 'd')).toBe('27');
    expect(format(new Date(endDate), 'd')).toBe('3');
    expect(new Date(endDate).getTime()).toBeGreaterThan(new Date(startDate).getTime());
  });

  it('defaults the first trial to the one-day show date, not the entry period', async () => {
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
    expect(show.entryOpenDate).not.toBe('');
    unmount();

    render(<TrialsHarness />);
    await user.click((await screen.findAllByRole('button', { name: 'Add First Trial' }))[0]!);

    const [trial] = useWizardStore.getState().trials;
    expect(trial?.dateTime.slice(0, 10)).toBe(dayKey(show.startDate));
    expect(trial?.dateTime.slice(0, 10)).not.toBe(dayKey(show.entryOpenDate));
    expect(trial?.dateTime.slice(0, 10)).not.toBe(dayKey(show.entryCloseDate));
  });

  it('puts the third default trial on the next show day and explains Add Another vs Next', async () => {
    const user = userEvent.setup();
    useWizardStore.getState().updateShowData({
      startDate: new Date(2026, 7, 14, 8).toISOString(),
      endDate: new Date(2026, 7, 15, 17).toISOString(),
      entryOpenDate: new Date(2026, 6, 1, 8).toISOString(),
      entryCloseDate: new Date(2026, 7, 5, 23).toISOString(),
    });
    render(<TrialsHarness />);
    expect(screen.queryByTestId('trial-next-step-help')).not.toBeInTheDocument();

    await user.click((await screen.findAllByRole('button', { name: 'Add First Trial' }))[0]!);
    const help = screen.getByTestId('trial-next-step-help');
    expect(help).toHaveTextContent('Add Another Trial');
    expect(help).toHaveTextContent('Next');

    await user.click(screen.getAllByRole('button', { name: 'Add Another Trial' })[0]!);
    await user.click(screen.getAllByRole('button', { name: 'Add Another Trial' })[0]!);

    const days = useWizardStore.getState().trials.map(t => t.dateTime.slice(0, 10));
    expect(days).toEqual(['2026-08-14', '2026-08-14', '2026-08-15']);
  });
});
