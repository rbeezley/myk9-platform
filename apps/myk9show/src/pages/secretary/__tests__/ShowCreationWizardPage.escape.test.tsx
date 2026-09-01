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
import { useWizardStore } from '@/store/wizardStore';
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

// MYK9-287. These tests used to type a 22-character show name, and that string
// -- not the dialog -- was the flake. `#show-name` is a CONTROLLED input bound
// to the persisted `useWizardStore`, so every keystroke re-renders the whole
// wizard AND fires a zustand `persist` write into fake-indexeddb. Measured on
// efficiency cores under coverage (`taskpolicy -b ... --coverage`, the recipe
// CLAUDE.md prescribes for timeout-class flakes):
//
//   render=1549ms  type22=11251ms  find-cancel=2310ms  click=1209ms  dialog=398ms
//
// ~512ms per character. Typing alone blew vitest's `testTimeout: 10000` while
// the dialog it was blamed for took 398ms. `updateShowData` sets
// `isDirty: true` unconditionally, so ONE character establishes everything
// these tests need -- a real keystroke through the DOM marking the form dirty.
// Do not restore a longer string here to make the test read more realistically;
// the extra characters buy no coverage and cost ten seconds of CI budget.
const DIRTYING_KEYSTROKE = 'Z';

describe('ShowCreationWizardPage — Escape', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    Element.prototype.scrollIntoView = vi.fn<typeof Element.prototype.scrollIntoView>();
    // `useWizardStore` is a module singleton, so without this the tests below
    // run against whatever the previous one left -- the name field arrives
    // pre-filled and `isDirty` already true. CI runs with `--sequence.shuffle`,
    // which reorders tests inside a file as well as the files themselves, so
    // that leak makes the outcome depend on a random seed.
    useWizardStore.getState().resetWizard();
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
    expect(nameField).not.toBeNull();
    await userEvent.type(nameField!, DIRTYING_KEYSTROKE);

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
    await userEvent.type(nameField!, DIRTYING_KEYSTROKE);

    const cancel = screen.queryByRole('button', { name: /^cancel$/i });
    expect(cancel).not.toBeNull();
    await userEvent.click(cancel!);

    // Bounded below vitest's `testTimeout: 10000` so a failure surfaces as
    // Testing Library's "unable to find" -- which names the missing text --
    // rather than as an opaque whole-test timeout that says nothing about which
    // phase ran long. Reading one of those as if it were this assertion is what
    // sent MYK9-287 after the wrong cause; see the note above.
    expect(await screen.findByText(LEAVE_PROMPT, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/shows');
  });
});
