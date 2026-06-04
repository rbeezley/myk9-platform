// apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { InstallAppSettings } from '../InstallAppSettings';

const mockUsePWAInstall = vi.fn();

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => mockUsePWAInstall(),
}));

const defaultPWAState = {
  isInstalled: false,
  wasInstalledBefore: false,
  canInstall: true,
  isDismissed: false,
  isIOSSafari: false,
  promptInstall: vi.fn().mockResolvedValue(true),
  dismissInstallPrompt: vi.fn(),
  getInstallInstructions: vi.fn().mockReturnValue('Click the install button in the address bar'),
};

describe('InstallAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePWAInstall.mockReturnValue(defaultPWAState);
  });

  it('renders section title and description', () => {
    render(<InstallAppSettings />);
    expect(screen.getByText('Install App')).toBeInTheDocument();
    expect(screen.getByText(/add myK9Show to your home screen/i)).toBeInTheDocument();
  });

  it('shows installed status when app is installed', () => {
    mockUsePWAInstall.mockReturnValue({ ...defaultPWAState, isInstalled: true });
    render(<InstallAppSettings />);
    expect(screen.getByText(/app installed/i)).toBeInTheDocument();
  });

  it('shows install button when install is available', () => {
    render(<InstallAppSettings />);
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('calls promptInstall when install button is clicked', async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    mockUsePWAInstall.mockReturnValue({ ...defaultPWAState, promptInstall });
    const { user } = render(<InstallAppSettings />);
    await user.click(screen.getByRole('button', { name: /install/i }));
    expect(promptInstall).toHaveBeenCalled();
  });

  it('shows iOS instructions when on iOS Safari', () => {
    mockUsePWAInstall.mockReturnValue({
      ...defaultPWAState,
      canInstall: false,
      isIOSSafari: true,
      getInstallInstructions: vi.fn().mockReturnValue('Tap Share then Add to Home Screen'),
    });
    render(<InstallAppSettings />);
    expect(screen.getByText(/share/i)).toBeInTheDocument();
  });

  it('shows benefits list', () => {
    render(<InstallAppSettings />);
    expect(screen.getByText('Show alerts when your dogs are up')).toBeInTheDocument();
    expect(screen.getByText('Offline Ringside access at trial grounds')).toBeInTheDocument();
    expect(screen.getByText(/faster loading/i)).toBeInTheDocument();
  });

  it('hides install button when neither canInstall nor isIOSSafari', () => {
    mockUsePWAInstall.mockReturnValue({
      ...defaultPWAState,
      canInstall: false,
      isIOSSafari: false,
    });
    render(<InstallAppSettings />);
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });
});
