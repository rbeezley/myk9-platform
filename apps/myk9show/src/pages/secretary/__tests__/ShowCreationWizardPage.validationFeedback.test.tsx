import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useWizardStore } from '@/store/wizardStore';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// The wizard's Step 1 "Next" used to sit disabled while required fields were
// missing, so clicking it did nothing and gave the secretary no clue why
// (audit finding #2, docs/audits/2026-07-01-show-creation-wizard-ux.md). These
// tests pin the corrected behavior: Next stays clickable, an inline count hints
// at what's missing, and the click shows each error beside its field and focuses the first.

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: () => ({
    handleCreateShow: vi.fn(),
    handleSaveProgress: vi.fn(),
  }),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

const { show: initialShow, completedSteps: initialCompleted } = useWizardStore.getState();

describe('ShowCreationWizardPage — Step 1 Next-button feedback', () => {
  let scrollIntoView: typeof Element.prototype.scrollIntoView;
  const scrolled: Element[] = [];

  beforeEach(() => {
    mockNavigate.mockReset();
    // jsdom does not implement scrollIntoView; spy on it so we can assert the
    // banner is scrolled into view without it throwing.
    scrolled.length = 0;
    scrollIntoView = vi.fn<typeof Element.prototype.scrollIntoView>(function (this: Element) {
      scrolled.push(this);
    });
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the Next button enabled when required fields are missing', () => {
    // A fresh wizard resets to Step 1 with required fields blank.
    render(<ShowCreationWizardPage />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('shows an inline "N items remaining" hint before any click', () => {
    render(<ShowCreationWizardPage />);

    // "items", not "required fields" — the count also covers non-field issues
    // like date ordering, so the label stays honest on every step.
    expect(screen.getByText(/\d+ items? remaining/i)).toBeInTheDocument();
  });

  it('shows a required-field error beside its field, not in a top banner', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    // Nothing is flagged until the secretary actually attempts to advance.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));

    const nameInput = await screen.findByRole('textbox', { name: /show name/i });
    const callout = await screen.findByText('Please enter a show name');
    // Beside the field: inside the same field group as the input it belongs to.
    expect(nameInput.parentElement).toContainElement(callout);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAccessibleDescription('Please enter a show name');

    // Custom controls carry the same error on their trigger.
    expect(screen.getByRole('combobox', { name: /host club/i })).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    // The visible top banner is gone: every step 1 problem belongs to a field. (A hidden
    // live summary still announces the failure; see the next test.)
    expect(screen.queryByRole('button', { name: /needs? attention/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Please enter a show name')).toHaveLength(1);
  });

  describe('the failed-Next live region', () => {
    // The tests below move the store's data; put it back so file order never matters.
    const restoreStore = () =>
      useWizardStore.setState({
        show: initialShow,
        trials: [],
        currentStep: 0,
        completedSteps: initialCompleted,
      });
    beforeEach(restoreStore);
    afterEach(restoreStore);

    // The header also has a Back (close) button; the step navigation's is the last in the DOM.
    const navBack = () => screen.getAllByRole('button', { name: /^back$/i }).at(-1)!;
    const getRegion = () => screen.getByTestId('wizard-failed-next-status');
    const validStepOne = {
      name: 'Spring Trial',
      organization: 'AKC',
      startDate: '2026-11-07T12:00:00.000Z',
      endDate: '2026-11-08T12:00:00.000Z',
      location: 'Austin, TX',
      clubId: 'club-1',
      officials: { chairman: ['p1'], secretary: ['p2'], steward: [] },
    };

    it('is one node present before any Next, empty, and the same node afterwards', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      const region = getRegion();
      expect(region).toHaveAttribute('role', 'status');
      expect(region).toHaveTextContent('');
      expect(region).toHaveClass('sr-only');

      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(region).toHaveTextContent(/need.* attention/));
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(getRegion()).toBe(region);
    });

    it('says the count and the first error in document order after a failed Next', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      await user.click(screen.getByRole('button', { name: /next/i }));

      const region = getRegion();
      await waitFor(() =>
        expect(region).toHaveTextContent(/^\d+ items need attention\. Please enter a show name$/)
      );
      // No live role anywhere else: the callouts are silent, the region speaks once.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('updates when a second failed Next has a different first error', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      const region = getRegion();
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(region).toHaveTextContent('Please enter a show name'));

      await user.type(await screen.findByRole('textbox', { name: /show name/i }), 'S');
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => expect(region).not.toHaveTextContent('Please enter a show name'));
      expect(region).toHaveTextContent(/items? needs? attention\. Please /);
      expect(getRegion()).toBe(region);
    });

    it('is cleared by a successful Next and by Back, and stays empty at the next step', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      const region = getRegion();
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(region).toHaveTextContent(/attention/));

      // Fix everything on step 1, then Next: advances and clears.
      await act(async () => {
        useWizardStore.getState().updateShowData(validStepOne);
      });
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(useWizardStore.getState().currentStep).toBe(1));
      expect(region).toHaveTextContent('');

      // Step 2 has no trials: a failed Next there announces its banner issue.
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() =>
        expect(region).toHaveTextContent('1 item needs attention. Please add at least one trial')
      );

      // Back clears it, and returning to the step does not resurrect it.
      await user.click(navBack());
      await waitFor(() => expect(useWizardStore.getState().currentStep).toBe(0));
      expect(region).toHaveTextContent('');
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(useWizardStore.getState().currentStep).toBe(1));
      expect(region).toHaveTextContent('');
      expect(getRegion()).toBe(region);
    });

    it('stays silent when a step changes from inside a step, not through Next or Back', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      const region = getRegion();
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(region).toHaveTextContent('Please enter a show name'));

      // A review-step Edit link (and anything else) moves the store's step directly. Step 2 has
      // issues of its own, so only the step tag keeps step 1's sentence from showing there.
      await act(async () => {
        useWizardStore.getState().setCurrentStep(1);
      });
      expect(region).toHaveTextContent('');
      expect(getRegion()).toBe(region);
    });

    it('never shows stale text once the banner empties', async () => {
      const { user } = render(<ShowCreationWizardPage />);
      const region = getRegion();
      await act(async () => {
        useWizardStore.getState().updateShowData(validStepOne);
      });
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(useWizardStore.getState().currentStep).toBe(1));
      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(region).toHaveTextContent('Please add at least one trial'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Fixing the issue (a trial is added) empties the banner; the region follows.
      await act(async () => {
        useWizardStore.getState().addTrial({
          trialDate: '2026-11-07',
          startTimeDraft: '9:00 AM',
          eventNumber: '2026101',
          trialType: 'Scent Work',
          classes: [],
        });
      });
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(region).not.toHaveTextContent('Please add at least one trial');
    });
  });

  it('focuses the first failing field and scrolls it into view', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    await user.click(screen.getByRole('button', { name: /next/i }));

    const nameInput = await screen.findByRole('textbox', { name: /show name/i });
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(scrolled).toContain(nameInput);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
  });

  it('focuses the first failing field again on a repeat Next click (no re-render needed)', async () => {
    const { user } = render(<ShowCreationWizardPage />);
    const next = screen.getByRole('button', { name: /next/i });

    await user.click(next);
    const nameInput = await screen.findByRole('textbox', { name: /show name/i });
    await waitFor(() => expect(nameInput).toHaveFocus());

    // Second click changes no state, so React may skip the render; focus still returns.
    scrolled.length = 0;
    await user.click(next);
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(scrolled).toContain(nameInput);
  });

  it('clears a field error as soon as that field becomes valid', async () => {
    const { user } = render(<ShowCreationWizardPage />);
    await user.click(screen.getByRole('button', { name: /next/i }));

    const nameInput = await screen.findByRole('textbox', { name: /show name/i });
    expect(screen.getByText('Please enter a show name')).toBeInTheDocument();

    await user.type(nameInput, 'S');

    await waitFor(() => expect(screen.queryByText('Please enter a show name')).toBeNull());
    expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('lists an issue in the banner when its control is hidden behind the create form', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    // Open the "Add new Chair" form: the chair picker and its callout are not on screen.
    await user.click(screen.getByLabelText(/^chair/i));
    await user.click(await screen.findByRole('button', { name: /add new chair/i }));
    expect(screen.queryByLabelText(/^chair/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));

    // No callout can carry it, so the top banner does.
    const banner = await screen.findByRole('button', { name: /needs? attention/i });
    const details = banner.closest('[role="alert"]');
    expect(details).toHaveTextContent('Please select a chair');
    // The issues that DO have a callout are not repeated there.
    expect(details).not.toHaveTextContent('Please enter a show name');
  });
});
