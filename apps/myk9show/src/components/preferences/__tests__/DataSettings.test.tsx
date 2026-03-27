// apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { DataSettings } from '../DataSettings';

// Mock queryClient
vi.mock('@/lib/queryClient', () => ({
  queryClient: { clear: vi.fn() },
  queryKeys: {},
  cacheStrategies: {},
}));

// Grab a reference to the mock after module is loaded
import { queryClient as mockQueryClient } from '@/lib/queryClient';
const mockClear = vi.mocked(mockQueryClient.clear);

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock location.reload
const mockReload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: mockReload },
  writable: true,
});

describe('DataSettings cache clear', () => {
  const defaultProps = {
    preferences: undefined,
    onUpdate: vi.fn(),
    onReset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders clear cache button', () => {
    render(<DataSettings {...defaultProps} />);
    expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
  });

  it('shows confirmation before clearing', async () => {
    mockConfirm.mockReturnValue(false);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('clear'));
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('clears React Query cache and reloads on confirm', async () => {
    mockConfirm.mockReturnValue(true);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(mockClear).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
  });

  it('preserves settings and auth keys in localStorage', async () => {
    localStorage.setItem('myK9Q_settings', '{"theme":"dark"}');
    localStorage.setItem('supabase.auth.token', '{"access_token":"abc"}');
    localStorage.setItem('myk9-notification-preferences', '{"enabled":true}');
    localStorage.setItem('scroll_shows', '150');

    mockConfirm.mockReturnValue(true);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));

    // Preserved
    expect(localStorage.getItem('myK9Q_settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('supabase.auth.token')).toBe('{"access_token":"abc"}');
    // Cleared
    expect(localStorage.getItem('myk9-notification-preferences')).toBeNull();
    expect(localStorage.getItem('scroll_shows')).toBeNull();
  });
});
