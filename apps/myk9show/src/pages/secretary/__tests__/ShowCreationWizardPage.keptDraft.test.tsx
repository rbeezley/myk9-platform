/**
 * MYK9-1794 — Add Show after an Add trials / Add classes visit, and the "we kept it"
 * reassurance on the way out of a half-built new show.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { useWizardStore } from '@/store/wizardStore';
import { notifications } from '@/lib/notifications';
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

vi.mock('@/lib/notifications', () => ({
  notifications: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

const KEPT_TOAST = 'We kept this show so you can finish it later.';

function nameField(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>('#show-name');
  if (!field) throw new Error('show name field not rendered');
  return field;
}

async function pressCancel() {
  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
}

describe('ShowCreationWizardPage — the kept new-show draft', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(notifications.info).mockReset();
    Element.prototype.scrollIntoView = vi.fn<typeof Element.prototype.scrollIntoView>();
    // Module singleton: leave no edit visit or draft behind for the next (shuffled) test.
    useWizardStore.getState().endEditVisit();
    useWizardStore.getState().resetWizard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Add Show after an Add classes visit shows the new-show draft, never the existing show', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ name: 'Spring Trial (new)' });
    store.loadEditDraft({ show: { ...store.show, name: 'Fall Classic (existing)' }, trials: [] });
    expect(useWizardStore.getState().show.name).toBe('Fall Classic (existing)');

    render(<ShowCreationWizardPage />);

    expect(nameField()).toHaveValue('Spring Trial (new)');
    expect(screen.getByText('Picking up where you left off')).toBeInTheDocument();
    expect(useWizardStore.getState().parkedCreateDraft).toBeNull();
  });

  it('Add Show after backing out of Add classes, with no new show begun, starts empty', () => {
    const store = useWizardStore.getState();
    store.loadEditDraft({ show: { ...store.show, name: 'Fall Classic (existing)' }, trials: [] });

    render(<ShowCreationWizardPage />);

    expect(nameField()).toHaveValue('');
    expect(screen.queryByText('Picking up where you left off')).toBeNull();
  });

  it('says the show was kept when she leaves one with a name', async () => {
    useWizardStore.getState().updateShowData({ name: 'Spring Trial (new)' });
    render(<ShowCreationWizardPage />);

    await pressCancel();

    expect(notifications.info).toHaveBeenCalledWith(KEPT_TOAST);
    expect(mockNavigate).toHaveBeenCalledWith('/shows');
  });

  it('says nothing when she backs out of a wizard she never filled in', async () => {
    // Opening the wizard auto-fills her as secretary, which marks the form dirty. Dirty is
    // not "a show worth keeping"; the banner's own test (a name or a trial) decides.
    useWizardStore.getState().setDirty(true);
    render(<ShowCreationWizardPage />);

    await pressCancel();

    expect(notifications.info).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/shows');
  });
});
