import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import TitleProgressTeaser from './TitleProgressTeaser';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('TitleProgressTeaser', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the dog name in the teaser copy', () => {
    render(<TitleProgressTeaser dogName="Rex" />);
    expect(screen.getByText(/Track Rex's title progress/)).toBeInTheDocument();
  });

  it('navigates to /pricing-page when Upgrade to unlock is clicked', async () => {
    const { user } = render(<TitleProgressTeaser dogName="Rex" />);
    await user.click(screen.getByRole('button', { name: /upgrade to unlock/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing-page');
  });
});
