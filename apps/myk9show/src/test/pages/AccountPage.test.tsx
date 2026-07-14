import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render as renderWithProviders } from '@/test/utils/testUtils';
import AccountPage from '@/pages/AccountPage';

const mockForm = {
  personId: 'p-1',
  person: { id: 'p-1', firstName: 'Jane', lastName: 'Doe', profileImage: null },
  email: 'jane@example.com',
  values: { firstName: 'Jane', lastName: 'Doe', phone: '', city: '', state: '', zipCode: '' },
  setValue: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
  isDirty: false,
  saving: false,
};

vi.mock('@/hooks/useProfileForm', () => ({
  useProfileForm: () => mockForm,
}));

const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() },
}));

vi.mock('@/hooks/useAvatarUpload', () => ({
  useAvatarUpload: () => ({ upload: vi.fn(), uploading: false }),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUpdatePerson: () => ({ mutate: vi.fn() }),
}));

let mockDogs: Array<{ id: string; name: string; call_name?: string; breed?: string }> = [];
let mockDogsLoading = false;
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: mockDogs, isLoading: mockDogsLoading }),
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ signOut: mockSignOut }),
}));

const mockDeleteUser = vi.fn();
vi.mock('@/services/database/users/reads', () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

const mockRevokeSelfAuthIdentity = vi.fn().mockResolvedValue({ revoked: true, error: null });
vi.mock('@/services/auth/revokeSelfAuthIdentity', () => ({
  revokeSelfAuthIdentity: () => mockRevokeSelfAuthIdentity(),
}));

vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ id: 'u-1', email: 'jane@example.com' }),
}));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    loading: false,
    syncState: null,
    updatePreferences: vi.fn().mockResolvedValue(undefined),
    resetToDefaults: vi.fn().mockResolvedValue(undefined),
    exportPreferences: vi.fn().mockResolvedValue('{}'),
    importPreferences: vi.fn().mockResolvedValue(undefined),
    forceSync: vi.fn(),
  }),
}));

// Stub heavy preference sub-components
vi.mock('@/components/preferences/ThemeSelector', () => ({
  ThemeSelector: () => <div data-testid="theme-selector" />,
}));
vi.mock('@/components/notifications/NotificationSettings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));
vi.mock('@/components/preferences/GeneralSettings', () => ({
  GeneralSettings: () => <div data-testid="general-settings" />,
}));
vi.mock('@/components/preferences/PrivacySettings', () => ({
  PrivacySettings: () => <div data-testid="privacy-settings" />,
}));
vi.mock('@/components/preferences/SecuritySettings', () => ({
  SecuritySettings: () => <div data-testid="security-settings" />,
}));
vi.mock('@/components/preferences/DataSettings', () => ({
  DataSettings: () => <div data-testid="data-settings" />,
}));
vi.mock('@/components/preferences/InstallAppSettings', () => ({
  InstallAppSettings: () => <div data-testid="install-settings" />,
}));

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDogs = [];
    mockDogsLoading = false;
    mockForm.isDirty = false;
    mockForm.saving = false;
  });

  const render = (initialRoute = '/account') =>
    renderWithProviders(<AccountPage />, { initialRoute });

  it('renders the page heading', () => {
    render();
    expect(screen.getByRole('heading', { name: /account/i })).toBeInTheDocument();
  });

  it('shows all nav group labels', () => {
    render();
    // Group labels are <p> elements — some share text with nav items, so query by role-less text
    expect(screen.getByText('Your account')).toBeInTheDocument();
    expect(screen.getByText('Display')).toBeInTheDocument();
    // 'Notifications' appears as both group label and nav item — verify at least 2 occurrences
    expect(screen.getAllByText('Notifications').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Privacy & security')).toBeInTheDocument();
    expect(screen.getByText('Advanced settings')).toBeInTheDocument();
  });

  it('shows all nav items', () => {
    render();
    [
      'Profile',
      'My dogs',
      'Appearance',
      'General',
      'Notifications',
      'Privacy',
      'Security',
      'Data & sync',
      'Install app',
      'Delete account',
    ].forEach(label => expect(screen.getByRole('button', { name: label })).toBeInTheDocument());
  });

  it('defaults to the Profile section', () => {
    render();
    expect(screen.getByText('Profile photo')).toBeInTheDocument();
    expect(screen.getByText('Personal information')).toBeInTheDocument();
  });

  it('opens the requested section from the section query param', () => {
    render('/account?section=notifications');
    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('switches to My dogs section on click', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'My dogs' }));
    expect(screen.getByText(/you don't have any dogs yet/i)).toBeInTheDocument();
  });

  it('switches to Appearance section and renders ThemeSelector', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByTestId('theme-selector')).toBeInTheDocument();
  });

  it('switches to General section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByTestId('general-settings')).toBeInTheDocument();
  });

  it('switches to Notifications section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
  });

  it('switches to Privacy section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(screen.getByTestId('privacy-settings')).toBeInTheDocument();
  });

  it('switches to Security section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    expect(screen.getByTestId('security-settings')).toBeInTheDocument();
  });

  it('switches to Data & sync section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Data & sync' }));
    expect(screen.getByTestId('data-settings')).toBeInTheDocument();
  });

  it('switches to Install app section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(screen.getByTestId('install-settings')).toBeInTheDocument();
  });

  it('DogsSection shows dog list when dogs present', () => {
    mockDogs = [
      { id: 'd-1', name: 'Biscuit', call_name: 'Biscuit', breed: 'Border Collie' },
      { id: 'd-2', name: 'Max', call_name: 'Max', breed: '' },
    ];
    render();
    fireEvent.click(screen.getByRole('button', { name: 'My dogs' }));
    expect(screen.getByText('Biscuit')).toBeInTheDocument();
    expect(screen.getByText('Border Collie')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('DeleteSection shows two-step confirm', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByText(/permanently delete your account/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, delete account/i })).toBeInTheDocument();
  });

  it('DeleteSection cancel hides the confirm panel', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });

  it('DeleteSection keeps the destructive button disabled until exact confirmation text is typed', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    const confirmButton = screen.getByRole('button', { name: /yes, delete account/i });
    const confirmInput = screen.getByLabelText(/type.*delete.*to confirm/i);

    expect(confirmButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'delete' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'DELETE ME' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    expect(confirmButton).not.toBeDisabled();
  });

  it('DeleteSection does not call deleteUser when confirmation text is wrong', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    const confirmInput = screen.getByLabelText(/type.*delete.*to confirm/i);
    fireEvent.change(confirmInput, { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('DeleteSection revokes the auth identity after deleting the person and before signing out', async () => {
    mockDeleteUser.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    const confirmInput = screen.getByLabelText(/type.*delete.*to confirm/i);
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(mockRevokeSelfAuthIdentity).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());

    expect(mockDeleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockRevokeSelfAuthIdentity.mock.invocationCallOrder[0]
    );
    expect(mockRevokeSelfAuthIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0]
    );
  });

  it('DeleteSection surfaces the owns-live-dogs server rejection reason', async () => {
    // getUserFriendlyError only maps error codes (MK001 → friendly text) in its
    // production branch; vitest runs with DEV=true, so stub it off for this test.
    vi.stubEnv('DEV', false);
    mockDeleteUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'MK001', message: 'people_owns_dogs_guard' },
    });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    const confirmInput = screen.getByLabelText(/type.*delete.*to confirm/i);
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    await waitFor(() =>
      expect(screen.getByText(/still owns dogs.*delete those dogs first/i)).toBeInTheDocument()
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('DeleteSection retries only identity revocation after a transport failure', async () => {
    mockDeleteUser.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    mockRevokeSelfAuthIdentity
      .mockResolvedValueOnce({ revoked: false, error: new Error('network unavailable') })
      .mockResolvedValueOnce({ revoked: true, error: null });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type.*delete.*to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/profile was deleted, but we couldn't disable sign-in.*try again/i)
      ).toBeInTheDocument()
    );
    expect(mockDeleteUser).toHaveBeenCalledOnce();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /retry disabling sign-in/i }));

    await waitFor(() => expect(mockRevokeSelfAuthIdentity).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce());
    expect(mockDeleteUser).toHaveBeenCalledOnce();
  });

  it('DeleteSection confirms success with a toast before signing out', async () => {
    mockDeleteUser.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type.*delete.*to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('DeleteSection reports an accurate message when only sign-out fails', async () => {
    mockDeleteUser.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error('network down'));
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type.*delete.*to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete account/i }));

    await waitFor(() =>
      expect(screen.getByText(/account was deleted, but signing out failed/i)).toBeInTheDocument()
    );
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('shows save/discard buttons when form is dirty', () => {
    mockForm.isDirty = true;
    render();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('shows success flash after reset', async () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: /reset all settings/i }));
    await waitFor(() => {
      expect(screen.getByText(/reset to defaults/i)).toBeInTheDocument();
    });
  });

  it('renders the flash as a fixed overlay so it never reflows the nav', async () => {
    render();
    const nav = screen.getByRole('navigation', { name: /account sections/i });
    const navTopBefore = nav.getBoundingClientRect().top;

    fireEvent.click(screen.getByRole('button', { name: /reset all settings/i }));
    await waitFor(() => {
      expect(screen.getByTestId('account-flash-overlay')).toBeInTheDocument();
    });

    // Overlay is taken out of document flow (fixed position), so it never
    // pushes the nav down — geometry assertion per account-page-ux-remediation
    // Decision 5.
    expect(screen.getByTestId('account-flash-overlay')).toHaveClass('fixed');
    expect(nav.getBoundingClientRect().top).toBe(navTopBefore);
  });
});
