import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

const loadShows = vi.fn().mockResolvedValue(undefined);
const originalShowStore = useShowStore.getState();
const targetShow = { id: 'query-only-show', name: 'Spring Trial' } as Show;

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: () => ({
    handleSaveDraft: vi.fn(),
    handleCreateShow: vi.fn(),
    handleCreateAndPublish: vi.fn(),
  }),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams('showId=query-only-show&mode=add-trials')],
}));

describe('ShowCreationWizardPage edit-mode gate', () => {
  beforeEach(() => {
    loadShows.mockReset().mockResolvedValue(undefined);
    navigate.mockClear();
    useShowStore.setState({ shows: [], isLoading: false, error: null, loadShows });
  });

  afterEach(() => {
    useShowStore.setState({
      shows: originalShowStore.shows,
      isLoading: originalShowStore.isLoading,
      error: originalShowStore.error,
      loadShows: originalShowStore.loadShows,
    });
  });

  it('loads the writer-backed show store and keeps the wizard gated when the target is absent', async () => {
    render(<ShowCreationWizardPage />);

    await waitFor(() => expect(loadShows).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t open this show');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('opens the wizard when retry loads the target into the writer-backed store', async () => {
    let makeTargetAvailable = false;
    loadShows.mockImplementation(async () => {
      if (makeTargetAvailable) useShowStore.setState({ shows: [targetShow] });
    });
    const { user } = render(<ShowCreationWizardPage />);

    await screen.findByText('We couldn’t open this show');
    const callsBeforeRetry = loadShows.mock.calls.length;
    makeTargetAvailable = true;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(loadShows.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
    await waitFor(() =>
      expect(screen.queryByText('We couldn’t open this show')).not.toBeInTheDocument()
    );
  });
});
