import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ResultEntryDashboard from '@/pages/ResultEntryDashboard';
import type { UserRole } from '@/types/auth-types';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { email: 'judge@example.com', roles: ['site_admin'] },
    hasRole: (role: UserRole) => role === 'site_admin',
  }),
}));

describe('ResultEntryDashboard', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it('renders quick access cards as native buttons', async () => {
    const { user } = render(<ResultEntryDashboard />);

    const judgeScoring = screen.getByRole('button', { name: /judge scoring/i });
    expect(judgeScoring.tagName).toBe('BUTTON');

    await user.click(judgeScoring);

    expect(navigateMock).toHaveBeenCalledWith('/judge/dashboard');
  });

  it('does not emit the Base UI native button warning during dashboard interactions', async () => {
    const { user } = render(<ResultEntryDashboard />);

    await user.click(screen.getByRole('button', { name: /schedule/i }));
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.click(screen.getByRole('button', { name: /live results/i }));

    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('A component that acts as a button was not rendered as a native <button>')
    );
  });
});
