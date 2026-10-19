import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useWizardStore } from '@/store/wizardStore';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// Page-level pins for steps 2 (Trial Configuration) and 3 (Classes): a failed Next puts each
// error beside its own field, marks the control invalid, focuses the first failing control,
// speaks one sentence in the live region, and each callout clears once its field is fixed.
// Step 1 is covered in ShowCreationWizardPage.validationFeedback.test.tsx.

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: () => ({ handleCreateShow: vi.fn(), handleSaveProgress: vi.fn() }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [], isLoading: false, isInitialized: true }),
}));
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg data-testid="qr-code" /> }));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

const initial = useWizardStore.getState();
const restoreStore = () =>
  useWizardStore.setState({
    show: initial.show,
    trials: [],
    currentStep: 0,
    completedSteps: initial.completedSteps,
  });

const validShow = {
  name: 'Spring Trial',
  organization: 'AKC',
  startDate: '2026-11-07T12:00:00.000Z',
  endDate: '2026-11-08T12:00:00.000Z',
  location: 'Austin, TX',
  clubId: 'club-1',
  officials: { chairman: ['p1'], secretary: ['p2'], steward: [] },
};

const klass = {
  templateId: 'tmpl-akc',
  customizations: {
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    displayOrder: 1,
    fieldOverrides: {},
  },
};

const trial = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  nameOverride: name,
  trialDate: '2026-11-07',
  startTimeDraft: '9:00 AM',
  eventNumber: '2026101',
  trialType: 'Scent Work',
  classes: [],
  ...over,
});

function startAt(step: number, trials: ReturnType<typeof trial>[]) {
  useWizardStore.setState({ show: { ...initial.show, ...validShow }, trials, currentStep: step });
}

const region = () => screen.getByTestId('wizard-failed-next-status');
const next = () => screen.getByRole('button', { name: /next/i });

describe('ShowCreationWizardPage: failed Next on steps 2 and 3', () => {
  beforeEach(() => {
    restoreStore();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    restoreStore();
    vi.restoreAllMocks();
  });

  it('step 2: callouts under the event number and date, first one focused, then cleared', async () => {
    startAt(1, [trial('t1', 'Saturday', { trialDate: '', eventNumber: '' })]);
    const { user } = render(<ShowCreationWizardPage />);
    await user.click(next());

    const dateCallout = await screen.findByText('Please select a trial date');
    const eventCallout = screen.getByText('Please enter an event number (required for AKC events)');
    const dateControl = document.getElementById('trial-t1-dateTime')!;
    const eventControl = screen.getByRole('textbox', { name: /event number/i });
    expect(dateControl.closest('[data-testid="trial-date-field"]')).toContainElement(dateCallout);
    expect(eventControl.parentElement).toContainElement(eventCallout);
    expect(dateControl).toHaveAttribute('aria-invalid', 'true');
    expect(dateControl).toHaveAttribute('aria-describedby', 'trial-t1-dateTime-error');
    expect(eventControl).toHaveAttribute('aria-invalid', 'true');
    // The event number sits above the date in the card, so it is the first failing control.
    await waitFor(() => expect(eventControl).toHaveFocus());

    await waitFor(() =>
      expect(region()).toHaveTextContent(
        /^2 items need attention\. Please enter an event number for Saturday /
      )
    );
    expect(useWizardStore.getState().currentStep).toBe(1);

    await user.type(eventControl, '1');
    await waitFor(() =>
      expect(
        screen.queryByText('Please enter an event number (required for AKC events)')
      ).not.toBeInTheDocument()
    );
    expect(eventControl).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Please select a trial date')).toBeInTheDocument();
  });

  it('step 3: the empty trial is flagged on its own tab, focused, announced, then cleared', async () => {
    startAt(2, [trial('a', 'Saturday', { classes: [klass] }), trial('b', 'Sunday')]);
    const { user } = render(<ShowCreationWizardPage />);
    await user.click(next());

    const callout = await screen.findByText('Sunday needs at least one class');
    const sundayTab = screen.getByRole('tab', { name: /sunday/i });
    const saturdayTab = screen.getByRole('tab', { name: /saturday/i });
    expect(sundayTab).toHaveAttribute('aria-invalid', 'true');
    expect(sundayTab).toHaveAttribute('aria-describedby', 'class-trial-b-error');
    expect(saturdayTab).not.toHaveAttribute('aria-invalid', 'true');
    // Under ITS tab: same column index in the shared grid.
    const cells = Array.from(screen.getByTestId('trial-callout-row').children);
    const tabs = screen.getAllByRole('tab');
    expect(cells.findIndex(cell => cell.contains(callout))).toBe(tabs.indexOf(sundayTab));
    await waitFor(() => expect(sundayTab).toHaveFocus());
    await waitFor(() =>
      expect(region()).toHaveTextContent('1 item needs attention. Sunday needs at least one class')
    );
    expect(useWizardStore.getState().currentStep).toBe(2);

    await act(async () => {
      useWizardStore.getState().updateTrial('b', { classes: [klass] as never });
    });
    await waitFor(() =>
      expect(screen.queryByText('Sunday needs at least one class')).not.toBeInTheDocument()
    );
    expect(sundayTab).not.toHaveAttribute('aria-invalid', 'true');
  });
});
