/**
 * MYK9-931 (M1): one component per meaning, the same in create and edit. Show
 * dates and the entry period are the range picker in the wizard AND the Edit Show
 * tab; a trial's date and time is one date-time picker in the wizard AND Edit
 * Trial; a time of day is one input that normalises what was typed.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { Tabs } from '@/components/ui/tabs';
import { useWizardStore } from '@/store/wizardStore';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { DatesEntrySection } from '../wizard/steps/sections/DatesEntrySection';
import TrialConfigurationStep from '../wizard/steps/TrialConfigurationStep';
import { ShowEditBasicInfoTab } from '@/components/panels/edit/ShowEditBasicInfoTab';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import type { ShowEditFormData } from '@/components/panels/edit/ShowEditPanel.types';
import type { Trial } from '@/components/trials/types/trial.types';

vi.mock('@/hooks/useTemplates', () => ({ useTemplates: () => ({ templates: [] }) }));

const editData: ShowEditFormData = {
  id: 'show-1',
  name: 'QA Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-05-22',
  endDate: '2026-05-23',
  location: 'Coliseum',
  entryOpenDate: '2026-04-27',
  entryCloseDate: '2026-05-21',
  preEntryFee: '0',
  dayOfShowFee: '0',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'fieldGuide',
};

function TrialsHarness() {
  const trials = useWizardStore(state => state.trials);
  const trialView = createWizardTrialView(
    trials.map(trial => ({
      id: trial.id,
      trialDate: trial.trialDate,
      nameOverride: trial.nameOverride,
    })),
    []
  );
  return <TrialConfigurationStep trialView={trialView} />;
}

describe('show dates: create and edit render the same control', () => {
  it('the wizard renders the show-dates and entry-period range controls', () => {
    render(
      <DatesEntrySection
        show={useWizardStore.getState().show}
        dateRangeValid
        entryDatesValid
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByTestId('show-dates-field')).toBeInTheDocument();
    expect(screen.getByTestId('show-entry-period-field')).toBeInTheDocument();
  });

  it('Edit Show renders the very same two controls, not four date-time pickers', () => {
    render(
      <Tabs value="basic">
        <ShowEditBasicInfoTab
          data={editData}
          availableShowTypes={['AKC']}
          clubs={[{ id: 'club-1', name: 'Club', clubNumber: '1' }]}
          handleInputChange={() => vi.fn()}
          handleSelectChange={() => vi.fn()}
          handleDateChange={() => vi.fn()}
        />
      </Tabs>
    );
    const dates = screen.getByTestId('show-dates-field');
    const entry = screen.getByTestId('show-entry-period-field');
    expect(within(dates).getByRole('button', { name: /show dates/i })).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: /entry period/i })).toBeInTheDocument();
    expect(screen.queryByText('Entry Open Date')).not.toBeInTheDocument();
  });

  it('Edit Show never offers a time it would throw away (dates are date-only)', async () => {
    const { user } = render(
      <Tabs value="basic">
        <ShowEditBasicInfoTab
          data={editData}
          availableShowTypes={['AKC']}
          clubs={[{ id: 'club-1', name: 'Club', clubNumber: '1' }]}
          handleInputChange={() => vi.fn()}
          handleSelectChange={() => vi.fn()}
          handleDateChange={() => vi.fn()}
        />
      </Tabs>
    );
    const dates = screen.getByTestId('show-dates-field');
    expect(within(dates).getByRole('button', { name: /show dates/i })).not.toHaveTextContent(
      /\d:\d\d (AM|PM)/
    );
    await user.click(within(dates).getByRole('button', { name: /show dates/i }));
    expect(screen.queryByText(/start time/i)).not.toBeInTheDocument();
  });
});

const trialBase = {
  name: 'Saturday AM',
  trialDate: '2026-05-02',
  trialNumber: '1',
  status: 'Upcoming' as Trial['status'],
  eventNumber: '1',
  order: '1',
};

async function openScheduling(
  initial: Partial<Trial>,
  onSave = vi.fn().mockResolvedValue(undefined)
) {
  const view = render(
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="t1"
      trialName="Saturday AM"
      onSave={onSave}
      initialTrialData={{ ...trialBase, ...initial }}
    />
  );
  await view.user.click(screen.getByRole('tab', { name: /scheduling/i }));
  return { ...view, onSave };
}

describe('trial date and start time: create and edit render the same two controls', () => {
  it('the wizard trial card uses the shared date field and start-time field', async () => {
    useWizardStore.getState().addTrial({
      nameOverride: undefined,
      trialDate: '2026-08-15',
      startTimeDraft: '08:00 AM',
      eventNumber: '',
      classes: [],
    });
    render(<TrialsHarness />);
    expect(await screen.findByTestId('trial-date-field')).toBeInTheDocument();
    expect(screen.getByTestId('trial-start-time-field')).toBeInTheDocument();
  });

  it('Edit Trial renders the very same two controls', async () => {
    await openScheduling({ plannedStartTime: '09:00 AM' });
    const date = await screen.findByTestId('trial-date-field');
    expect(within(date).getByRole('button')).toHaveTextContent(/May 2, 2026/);
    expect(within(screen.getByTestId('trial-start-time-field')).getByRole('textbox')).toHaveValue(
      '09:00 AM'
    );
  });

  it('the wizard time field writes a valid time into the trial and blocks on a bad one', async () => {
    const user = userEvent.setup();
    useWizardStore.getState().addTrial({
      nameOverride: undefined,
      trialDate: '2026-08-15',
      startTimeDraft: '08:00 AM',
      eventNumber: '',
      classes: [],
    });
    render(<TrialsHarness />);
    const time = within(await screen.findByTestId('trial-start-time-field')).getByRole('textbox');
    await user.clear(time);
    await user.type(time, '1:30 PM');
    // The box's text is the start time, exactly as typed; the date is untouched.
    expect(useWizardStore.getState().trials[0]?.startTimeDraft).toBe('1:30 PM');
    expect(useWizardStore.getState().trials[0]?.trialDate).toBe('2026-08-15');

    await user.clear(time);
    // What is visible is what is validated: a blank time is no time.
    expect(useWizardStore.getState().trials[0]?.startTimeDraft).toBe('');
    expect(await screen.findAllByText(/start time/i)).not.toHaveLength(0);
  });
});

describe('the wizard stores a trial date and its typed time separately', () => {
  it('a time typed before any date is kept, and no date or default time appears', async () => {
    const user = userEvent.setup();
    useWizardStore.getState().addTrial({
      nameOverride: undefined,
      trialDate: '',
      eventNumber: '',
      classes: [],
    });
    render(<TrialsHarness />);
    const time = within(await screen.findByTestId('trial-start-time-field')).getByRole('textbox');
    expect(time).toHaveValue('');
    await user.type(time, '10:15 AM');

    const [stored] = useWizardStore.getState().trials;
    expect(stored?.startTimeDraft).toBe('10:15 AM');
    expect(stored?.trialDate).toBe('');
  });
});

describe('Edit Trial start time is its own field; the draft is what is validated', () => {
  it('clearing the time and saving shows the validation error and saves nothing', async () => {
    const { user, onSave } = await openScheduling({ plannedStartTime: '09:00 AM' });
    const time = within(await screen.findByTestId('trial-start-time-field')).getByRole('textbox');
    await user.clear(time);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect((await screen.findAllByText(/valid time/i)).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an invalid time shows the error and saves nothing', async () => {
    const { user, onSave } = await openScheduling({ plannedStartTime: '09:00 AM' });
    const time = within(await screen.findByTestId('trial-start-time-field')).getByRole('textbox');
    await user.clear(time);
    await user.type(time, 'soon');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect((await screen.findAllByText(/valid time/i)).length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a valid time saves exactly what was typed', async () => {
    const { user, onSave } = await openScheduling({ plannedStartTime: '09:00 AM' });
    const time = within(await screen.findByTestId('trial-start-time-field')).getByRole('textbox');
    await user.clear(time);
    await user.type(time, '10:15 AM');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      trialDate: '2026-05-02',
      plannedStartTime: '10:15 AM',
    });
  });

  it('a date change with an empty time keeps the time empty', async () => {
    const { user, onSave } = await openScheduling({ plannedStartTime: '' });
    const date = await screen.findByTestId('trial-date-field');
    await user.click(within(date).getByRole('button'));
    await user.click(await screen.findByRole('button', { name: /May 15th/ }));
    await user.keyboard('{Escape}');

    expect(within(date).getByRole('button')).toHaveTextContent(/May 15, 2026/);
    expect(within(screen.getByTestId('trial-start-time-field')).getByRole('textbox')).toHaveValue(
      ''
    );
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/valid time/i)).length).toBeGreaterThan(0);
  });

  it('Actual Start and Finish normalise typed times to one spelling', async () => {
    const { user } = await openScheduling({ plannedStartTime: '09:00 AM' });
    const start = await screen.findByLabelText('Actual Start');
    await user.type(start, '9:15pm');
    await user.tab();
    expect(start).toHaveValue('09:15 PM');
  });
});
