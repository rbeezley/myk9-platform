// apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { GeneralSettings } from '../GeneralSettings';
import { useSettingsStore } from '@/store/settingsStore';

// Mock the haptic feedback hook
vi.mock('@myk9/scoring-ui', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    isSupported: true,
  }),
}));

describe('GeneralSettings', () => {
  beforeEach(() => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: true });
  });

  it('renders haptic feedback toggle', () => {
    render(<GeneralSettings />);
    expect(screen.getByText('Haptic Feedback')).toBeInTheDocument();
    expect(screen.getByText(/vibrate on touch/i)).toBeInTheDocument();
  });

  it('reads haptic feedback state from settings store', () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    render(<GeneralSettings />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('writes haptic feedback state to settings store on toggle', async () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    const { user } = render(<GeneralSettings />);
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(useSettingsStore.getState().settings.hapticFeedback).toBe(true);
  });

  it('shows section title and description', () => {
    render(<GeneralSettings />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText(/app behavior and interaction/i)).toBeInTheDocument();
  });
});
