import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandingTab } from '@/components/clubs/ClubDetails/BrandingTab';
import type { Club } from '@/types/club-types';

// Mock heavy dependencies
vi.mock('@/components/ui/accent-color-picker', () => ({
  AccentColorPicker: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (c: string | null) => void;
  }) => (
    <div data-testid="accent-color-picker" onClick={() => onChange('#dc2626')}>
      {value ?? 'none'}
    </div>
  ),
}));
vi.mock('@/components/ui/cover-image-upload', () => ({
  CoverImageUpload: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shows/ShowCard', () => ({
  ShowCard: () => <div data-testid="show-card-preview">Preview</div>,
}));
vi.mock('@/lib/branding', () => ({
  generatePalette: () => ({
    primaryDark: '#1e293b',
    primary: '#2563eb',
    primaryLight: '#60a5fa',
    onPrimary: '#fff',
  }),
}));

const mockClub: Club = {
  id: 'club-1',
  name: 'Test Club',
  clubNumber: '',
  email: '',
  phone: '',
  description: '',
  logo: '',
  coverImage: '',
  accentColor: '#2563eb',
  address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
  upcomingShows: [],
  pastShows: [],
};

describe('BrandingTab', () => {
  it('renders accent color picker with current value', () => {
    render(
      <BrandingTab
        club={mockClub}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    expect(screen.getByTestId('accent-color-picker')).toBeInTheDocument();
  });

  it('shows Save/Discard when color changes', () => {
    render(
      <BrandingTab
        club={mockClub}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('calls onSaveAccentColor when Save clicked', () => {
    const onSave = vi.fn();
    render(
      <BrandingTab
        club={mockClub}
        onSaveAccentColor={onSave}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('#dc2626');
  });

  it('reverts color on Discard', () => {
    render(
      <BrandingTab
        club={mockClub}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Discard'));
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });
});
