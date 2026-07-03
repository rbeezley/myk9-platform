import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SecretaryAddEntriesDecision } from './SecretaryAddEntriesDecision';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('SecretaryAddEntriesDecision', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('routes secretary-owned dogs to exhibitor self-service registration', async () => {
    const { user } = render(<SecretaryAddEntriesDecision showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Enter my own dogs' }));

    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1/register');
  });

  it('routes exhibitor or paper entries to secretary registration', async () => {
    const { user } = render(<SecretaryAddEntriesDecision showId="show 1/mail" />);

    await user.click(screen.getByRole('button', { name: 'Record exhibitor or paper entry' }));

    expect(navigateMock).toHaveBeenCalledWith('/secretary/register/show%201%2Fmail');
  });

  it('stays disabled until a show is selected', () => {
    render(<SecretaryAddEntriesDecision showId={null} />);

    expect(screen.getByRole('button', { name: 'Enter my own dogs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record exhibitor or paper entry' })).toBeDisabled();
  });
});
