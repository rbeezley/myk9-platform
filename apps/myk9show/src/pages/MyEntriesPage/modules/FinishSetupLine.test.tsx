import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FinishSetupLine } from './FinishSetupLine';
import { UserRole } from '@/types/auth-types';

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/hooks/useExhibitorProfile', () => ({ useExhibitorProfile: vi.fn() }));

import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

const mockAuth = useAuthContext as ReturnType<typeof vi.fn>;
const mockProfile = useExhibitorProfile as ReturnType<typeof vi.fn>;

const completeAddress = {
  street_address: '1 Main St',
  city: 'Austin',
  state: 'TX',
  zip_code: '78701',
};

function setup({
  roles = [UserRole.EXHIBITOR],
  completed = false,
  settled = true,
  person,
}: {
  roles?: UserRole[];
  completed?: boolean;
  settled?: boolean;
  person?: Record<string, unknown>;
} = {}) {
  const user = { id: 'u1', email: 'a@b.com' };
  mockAuth.mockReturnValue({
    user,
    userWithRoles: { ...user, roles, permissions: [], scopes: [] },
    rbacLoading: false,
  });
  mockProfile.mockReturnValue({
    profile: {
      id: 'p1',
      person_id: 'person-1',
      onboarding_completed_at: completed ? '2026-07-07T12:00:00.000Z' : null,
      ...(person && { person }),
    },
    profileSettled: settled,
  });
}

describe('FinishSetupLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the missing address and links to /onboarding', () => {
    setup({ person: { street_address: '', city: '', state: '', zip_code: '' } });
    render(<FinishSetupLine />);
    expect(screen.getByText(/Add your mailing address: AKC prints it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute(
      'href',
      '/onboarding'
    );
  });

  it('offers plain set-up when the address is complete', () => {
    setup({ person: completeAddress });
    render(<FinishSetupLine />);
    expect(screen.getByText('Finish setting up your account.')).toBeInTheDocument();
  });

  it('shows nothing once set-up is finished', () => {
    setup({ completed: true });
    render(<FinishSetupLine />);
    expect(screen.queryByTestId('finish-setup-line')).not.toBeInTheDocument();
  });

  it('shows nothing to staff', () => {
    setup({ roles: [UserRole.SECRETARY] });
    render(<FinishSetupLine />);
    expect(screen.queryByTestId('finish-setup-line')).not.toBeInTheDocument();
  });

  it('shows nothing while the profile is unsettled', () => {
    setup({ settled: false });
    render(<FinishSetupLine />);
    expect(screen.queryByTestId('finish-setup-line')).not.toBeInTheDocument();
  });
});
