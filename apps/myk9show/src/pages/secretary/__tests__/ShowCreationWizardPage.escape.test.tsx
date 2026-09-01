/**
 * F3 — pressing Escape anywhere in the create-show wizard raised
 * "You have unsaved changes that will be lost. Are you sure you want to leave the
 * wizard?" Escape is the universal dismiss key, and the reflex after opening the club
 * or judge picker; being offered the loss of the whole show for it is alarming.
 *
 * The old listener already skipped when an overlay was open and still fired, because
 * the failure is a race: a popover handles Escape, closes itself, and the SAME keypress
 * continues to the window listener, which then correctly sees no open overlay. So the
 * binding is gone rather than guarded harder — nothing maps Escape to "abandon this
 * form", and the deliberate exit still confirms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

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

const LEAVE_PROMPT = /unsaved changes that will be lost/i;

describe('ShowCreationWizardPage — Escape', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    Element.prototype.scrollIntoView = vi.fn<typeof Element.prototype.scrollIntoView>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not offer to discard the show when Escape is pressed on a clean form', async () => {
    render(<ShowCreationWizardPage />);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText(LEAVE_PROMPT)).toBeNull();
  });

  it('does not offer to discard after the secretary has typed', async () => {
    // The reported case: the wizard is dirty, so the old listener fired. Typing a show
    // name is the least a secretary does before reaching for a picker.
    render(<ShowCreationWizardPage />);

    const nameField = document.querySelector('#show-name') as HTMLInputElement | null;
    if (nameField) {
      await userEvent.type(nameField, 'Escape Regression Show');
    }

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText(LEAVE_PROMPT)).toBeNull();
  });

  it('still confirms on the deliberate exit', async () => {
    // Removing the Escape binding must not remove the guard that matters: Cancel is
    // an explicit "I am leaving", and that is what warrants the prompt.
    render(<ShowCreationWizardPage />);

    const nameField = document.querySelector('#show-name') as HTMLInputElement | null;
    // Fail loudly if step 1 stops rendering this field. The previous `return` here
    // made the test PASS having asserted nothing, which is the one outcome a guard
    // against vacuity must not produce.
    expect(nameField).not.toBeNull();
    await userEvent.type(nameField!, 'Escape Regression Show');

    const cancel = screen.queryByRole('button', { name: /^cancel$/i });
    expect(cancel).not.toBeNull();
    await userEvent.click(cancel!);

    // MYK9-287: the leave prompt is a portalled AlertDialog, so this wait covers a
    // portal mount plus its transition -- not a state flush. Testing Library's
    // default 1000ms cleared that on an idle machine and not on a loaded CI runner:
    // it timed out twice, at 2603ms and 3018ms, on two SHAs in two different jobs,
    // while passing 8/8 locally under the usual slow-environment recipe. The headroom
    // is the fix; the assertion is unchanged.
    expect(await screen.findByText(LEAVE_PROMPT, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/shows');
  });
});
