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

vi.mock('@/hooks/useAvatarUpload', () => ({
  useAvatarUpload: () => ({ upload: vi.fn(), uploading: false }),
}));

vi.mock('@/hooks/useUsers', () => ({
  useUpdatePerson: () => ({ mutate: vi.fn() }),
}));

let mockDogs: Array<{ id: string; name: string; callName?: string; breed?: string }> = [];
let mockDogsLoading = false;
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: mockDogs, isLoading: mockDogsLoading }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ signOut: vi.fn() }),
}));

vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ id: 'u-1', email: 'jane@example.com' }),
}));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    loading: false,
    syncState: null,
    devices: [],
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
vi.mock('@/components/preferences/DeviceManager', () => ({
  DeviceManager: () => <div data-testid="device-manager" />,
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

  const render = () => renderWithProviders(<AccountPage />, { initialRoute: '/account' });

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
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('shows all nav items', () => {
    render();
    [
      'Profile',
      'Linked dogs',
      'Appearance',
      'General',
      'Notifications',
      'Privacy',
      'Security',
      'Data & sync',
      'Devices',
      'Install app',
      'Delete account',
    ].forEach(label => expect(screen.getByRole('button', { name: label })).toBeInTheDocument());
  });

  it('defaults to the Profile section', () => {
    render();
    expect(screen.getByText('Profile photo')).toBeInTheDocument();
    expect(screen.getByText('Personal information')).toBeInTheDocument();
  });

  it('switches to Linked dogs section on click', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Linked dogs' }));
    expect(screen.getByText(/no dogs linked/i)).toBeInTheDocument();
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

  it('switches to Devices section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    expect(screen.getByTestId('device-manager')).toBeInTheDocument();
  });

  it('switches to Install app section', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(screen.getByTestId('install-settings')).toBeInTheDocument();
  });

  it('DogsSection shows dog list when dogs present', () => {
    mockDogs = [
      { id: 'd-1', name: 'Biscuit', callName: 'Biscuit', breed: 'Border Collie' },
      { id: 'd-2', name: 'Max', callName: 'Max', breed: '' },
    ];
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Linked dogs' }));
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
});
