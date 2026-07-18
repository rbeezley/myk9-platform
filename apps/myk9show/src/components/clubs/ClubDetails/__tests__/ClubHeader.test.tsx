import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { AboutTab } from '../AboutTab';
import { ClubHeader } from '../ClubHeader';

vi.mock('@/components/ui/cover-image-upload', () => ({
  CoverImageUpload: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseClub: Club = {
  id: 'club-1',
  name: 'Heartland Club',
  clubNumber: 'HC-1',
  email: '',
  phone: '',
  website: undefined,
  description: '',
  address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
};

const noop = () => undefined;

describe('club contact actions', () => {
  it('omits the options menu and contact actions when contact values are absent', () => {
    render(<ClubHeader club={baseClub} onEditClub={noop} onEditPhoto={noop} onDeleteClub={noop} />);

    expect(screen.queryByRole('button', { name: 'Club options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
  });

  it('renders only the usable partial contact destinations', () => {
    const club = { ...baseClub, email: ' contact@heartland.example ', phone: '   ' };

    render(
      <>
        <ClubHeader club={club} onEditClub={noop} onEditPhoto={noop} onDeleteClub={noop} />
        <AboutTab club={club} />
      </>
    );

    expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact@heartland.example' })).toHaveAttribute(
      'href',
      'mailto:contact@heartland.example'
    );
    expect(screen.queryByRole('link', { name: /website/i })).not.toBeInTheDocument();
  });
});
