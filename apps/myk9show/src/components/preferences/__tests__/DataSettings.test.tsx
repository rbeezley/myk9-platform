// apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx
import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { DataSettings } from '../DataSettings';

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
  const renderSettings = () => {
    const queryClient = createTestQueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    return { ...render(<DataSettings />, { queryClient }), clearSpy };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders clear cache button', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
  });

  it('shows the offline-first note', () => {
    renderSettings();
    expect(screen.getByText(/works offline automatically/i)).toBeInTheDocument();
  });

  it('shows confirmation before clearing', async () => {
    mockConfirm.mockReturnValue(false);
    const { user, clearSpy } = renderSettings();
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('clear'));
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('clears React Query cache and reloads on confirm', async () => {
    mockConfirm.mockReturnValue(true);
    const { user, clearSpy } = renderSettings();
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(clearSpy).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
  });

  it('preserves settings and auth keys in localStorage', async () => {
    localStorage.setItem('myK9Q_settings', '{"theme":"dark"}');
    localStorage.setItem('sb-abc123-auth-token', '{"access_token":"abc"}');
    localStorage.setItem('myk9-notification-preferences', '{"enabled":true}');
    localStorage.setItem('scroll_shows', '150');

    mockConfirm.mockReturnValue(true);
    const { user } = renderSettings();
    await user.click(screen.getByRole('button', { name: /clear cache/i }));

    // Preserved
    expect(localStorage.getItem('myK9Q_settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('sb-abc123-auth-token')).toBe('{"access_token":"abc"}');
    // Cleared
    expect(localStorage.getItem('myk9-notification-preferences')).toBeNull();
    expect(localStorage.getItem('scroll_shows')).toBeNull();
  });
});
