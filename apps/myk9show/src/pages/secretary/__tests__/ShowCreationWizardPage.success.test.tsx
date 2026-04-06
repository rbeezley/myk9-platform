import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// Capture the onCreated callback the page passes to the hook so we can
// trigger it directly in tests — avoids navigating through wizard steps.
let capturedOnCreated: ((id: string, name: string) => void) | undefined;

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: (opts: {
    onCreated?: (id: string, name: string) => void;
    setIsLoading: (v: boolean) => void;
  }) => {
    capturedOnCreated = opts.onCreated;
    return {
      handleSaveDraft: vi.fn(),
      handleCreateShow: vi.fn(),
      handleCreateAndPublish: vi.fn(),
      handleSaveProgress: vi.fn(),
    };
  },
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr-code" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}));

describe('ShowCreationWizardPage success overlay', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    capturedOnCreated = undefined;
  });

  it('shows the success overlay with passcodes after show creation', () => {
    render(<ShowCreationWizardPage />);

    // Simulate the hook calling onCreated after a successful save
    act(() => {
      capturedOnCreated?.('63165809-e025-25c6-6cf9-979f63165809', 'Spring Trial');
    });

    expect(screen.getByText('Show Created!')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('ae025')).toBeInTheDocument();
    expect(screen.getByText('j25c6')).toBeInTheDocument();
    expect(screen.getByText('s6cf9')).toBeInTheDocument();
    expect(screen.getByText('e979f')).toBeInTheDocument();
  });

  it('navigates to the dashboard when Go to Dashboard is clicked', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    act(() => {
      capturedOnCreated?.('63165809-e025-25c6-6cf9-979f63165809', 'Spring Trial');
    });

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard');
  });
});
