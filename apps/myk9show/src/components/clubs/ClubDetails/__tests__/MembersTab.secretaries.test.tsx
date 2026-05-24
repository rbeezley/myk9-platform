import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils/testUtils';
import { MembersTab } from '../MembersTab';
import { clubSecretaryService } from '@/features/club-secretaries/clubSecretaryService';
import type { Club } from '@/types/club-types';
import type { User } from '@/types/user-types';

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../members/MemberList', () => ({
  MemberList: () => <div>Member list</div>,
}));

vi.mock('@/features/club-secretaries/clubSecretaryService', () => ({
  clubSecretaryService: {
    grantSecretary: vi.fn(),
    listSecretaries: vi.fn(),
    listSecretaryRoleIds: vi.fn(),
    revokeSecretary: vi.fn(),
  },
}));

const mockPeople: User[] = [
  {
    id: 'person-jane',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
  },
  {
    id: 'person-sam',
    firstName: 'Sam',
    lastName: 'Riley',
    email: 'sam@example.com',
  },
];

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (state: { people: User[] }) => unknown) => selector({ people: mockPeople }),
}));

const club: Club = {
  id: 'club-1',
  name: 'River City Scent Work Club',
  clubNumber: 'RCSWC',
  email: 'club@example.com',
  phone: '555-1234',
  description: '',
  logo: '',
  coverImage: '',
  accentColor: '#245',
  address: {
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  },
  memberIds: ['person-sam'],
  upcomingShows: [],
  pastShows: [],
};

describe('MembersTab secretary management', () => {
  beforeEach(() => {
    vi.mocked(clubSecretaryService.grantSecretary).mockReset();
    vi.mocked(clubSecretaryService.grantSecretary).mockResolvedValue('assignment-1');
    vi.mocked(clubSecretaryService.listSecretaries).mockReset();
    vi.mocked(clubSecretaryService.listSecretaries).mockResolvedValue([]);
    vi.mocked(clubSecretaryService.listSecretaryRoleIds).mockReset();
    vi.mocked(clubSecretaryService.listSecretaryRoleIds).mockResolvedValue(['secretary-role-id']);
    vi.mocked(clubSecretaryService.revokeSecretary).mockReset();
    vi.mocked(clubSecretaryService.revokeSecretary).mockResolvedValue(undefined);
  });

  it('lets club admins choose a secretary by person name instead of entering an id', async () => {
    const { user } = renderWithProviders(
      <MembersTab club={club} canManageMembers onAddMember={vi.fn()} />
    );

    expect(screen.getByText('Show Secretaries')).toBeInTheDocument();
    expect(screen.getByText('Select Secretary')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /select secretary/i }));
    await user.click(await screen.findByText('Jane Doe'));
    await user.click(screen.getByRole('button', { name: /add secretary/i }));

    await waitFor(() =>
      expect(clubSecretaryService.grantSecretary).toHaveBeenCalledWith({
        personId: 'person-jane',
        clubId: 'club-1',
      })
    );
  });
});
