/**
 * MYK9-931 (M1): one component per meaning, the same in create and edit. Show
 * dates and the entry period are the range picker in the wizard AND the Edit Show
 * tab; a trial's date and time is one date-time picker in the wizard AND Edit
 * Trial; a time of day is one input that normalises what was typed.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
      trialDate: trial.dateTime,
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

describe('trial date and time: create and edit render the same control', () => {
  it('the wizard trial card uses the shared trial date-time field', async () => {
    useWizardStore.getState().addTrial({
      nameOverride: undefined,
      dateTime: '2026-08-15T08:00:00',
      eventNumber: '',
      classes: [],
    });
    render(<TrialsHarness />);
    expect(await screen.findByTestId('trial-date-time-field')).toBeInTheDocument();
  });

  it('Edit Trial renders it too, with the time in the same control, not a free-text box', async () => {
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="t1"
        trialName="Saturday AM"
        initialTrialData={{
          name: 'Saturday AM',
          trialDate: '2026-05-02',
          trialNumber: '1',
          status: 'Upcoming' as Trial['status'],
          plannedStartTime: '09:00 AM',
          eventNumber: '1',
          order: '1',
        }}
      />
    );
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));
    const field = await screen.findByTestId('trial-date-time-field');
    expect(within(field).getByRole('button')).toHaveTextContent(/May 2, 2026 at 9:00 AM/);
    expect(screen.queryByPlaceholderText('e.g., 09:00 AM')).not.toBeInTheDocument();
  });

  it('Actual Start and Finish normalise typed times to one spelling', async () => {
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="t1"
        trialName="Saturday AM"
        initialTrialData={{
          name: 'Saturday AM',
          trialDate: '2026-05-02',
          trialNumber: '1',
          status: 'Upcoming' as Trial['status'],
          plannedStartTime: '09:00 AM',
          eventNumber: '1',
          order: '1',
        }}
      />
    );
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));
    const start = await screen.findByLabelText('Actual Start');
    await user.type(start, '9:15pm');
    await user.tab();
    expect(start).toHaveValue('09:15 PM');
  });
});

describe('Edit Trial start time storage and display', () => {
  const base = {
    name: 'Saturday AM',
    trialDate: '2026-05-02',
    trialNumber: '1',
    status: 'Upcoming' as Trial['status'],
    eventNumber: '1',
    order: '1',
  };

  it('shows a date with no start time as "time not set", not midnight', async () => {
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="t1"
        trialName="Saturday AM"
        initialTrialData={{ ...base, plannedStartTime: '' }}
      />
    );
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));
    const field = await screen.findByTestId('trial-date-time-field');
    expect(within(field).getByRole('button')).toHaveTextContent(/May 2, 2026/);
    expect(within(field).getByRole('button')).toHaveTextContent(/time not set/i);
    expect(within(field).getByRole('button')).not.toHaveTextContent(/12:00 AM/);
  });

  it('saves the picked time in the stored spelling', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="t1"
        trialName="Saturday AM"
        onSave={onSave}
        initialTrialData={{ ...base, plannedStartTime: '09:00 AM' }}
      />
    );
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));
    const field = await screen.findByTestId('trial-date-time-field');
    await user.click(within(field).getByRole('button'));
    const time = await screen.findByPlaceholderText('8:00 AM');
    await user.clear(time);
    await user.type(time, '1:30 PM');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      trialDate: '2026-05-02',
      plannedStartTime: '01:30 PM',
    });
  });

  it('changing the date never invents a start time: only an explicit time writes one', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="t1"
        trialName="Saturday AM"
        onSave={onSave}
        initialTrialData={{ ...base, plannedStartTime: '' }}
      />
    );
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));
    const field = await screen.findByTestId('trial-date-time-field');
    await user.click(within(field).getByRole('button'));
    await user.click(await screen.findByRole('button', { name: /May 15th/ }));
    await user.keyboard('{Escape}');

    // The new date is kept, the time is still unset (not 12:00 AM)...
    expect(within(field).getByRole('button')).toHaveTextContent(/May 15, 2026/);
    expect(within(field).getByRole('button')).toHaveTextContent(/time not set/i);
    // ...and a start time is still demanded: Save refuses and says so.
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/valid time/i)).length).toBeGreaterThan(0);

    // An explicit time then saves, with the date picked above.
    await user.click(within(field).getByRole('button'));
    await user.type(await screen.findByPlaceholderText('8:00 AM'), '10:15 AM');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      trialDate: '2026-05-15',
      plannedStartTime: '10:15 AM',
    });
  });
});
