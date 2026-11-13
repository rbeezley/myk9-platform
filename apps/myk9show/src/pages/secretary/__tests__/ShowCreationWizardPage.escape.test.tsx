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
 * form", and the deliberate exit keeps the draft (MYK9-1793).
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

const LEAVE_PROMPT = /unsaved changes/i;

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

  it('keeps the draft and leaves without asking on the deliberate exit (MYK9-1793)', async () => {
    // Until MYK9-1793 Cancel raised "unsaved changes that will be lost" and then reset the
    // wizard. Create mode persists its draft and the resume banner offers "Start a new show"
    // on the next visit, so leaving loses nothing and there is nothing to confirm.
    // The dirty-form precondition is set directly so this test measures the Cancel flow
    // rather than controlled-input and persist-write latency (MYK9-287, note above).
    useWizardStore.getState().updateShowData({ name: DIRTYING_KEYSTROKE });
    render(<ShowCreationWizardPage />);

    const cancel = screen.queryByRole('button', { name: /^cancel$/i });
    expect(cancel).not.toBeNull();
    await userEvent.click(cancel!);

    expect(mockNavigate).toHaveBeenCalledWith('/shows');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText(LEAVE_PROMPT)).toBeNull();
    expect(useWizardStore.getState().show.name).toBe(DIRTYING_KEYSTROKE);
  });

  it('offers "Start a new show" when she comes back without a page reload (MYK9-1793)', () => {
    // The resume banner hides while the store is dirty, and `isDirty` lives in a module
    // singleton that survives an in-app navigation. Unless leaving create mode clears it, the
    // return visit shows the old show's fields with no banner and no way to start fresh.
    useWizardStore.getState().updateShowData({ name: DIRTYING_KEYSTROKE });
    const firstVisit = render(<ShowCreationWizardPage />);
    expect(screen.queryByRole('button', { name: 'Start a new show' })).toBeNull();

    firstVisit.unmount();
    render(<ShowCreationWizardPage />);

    expect(screen.getByText('Picking up where you left off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a new show' })).toBeInTheDocument();
  });
});
