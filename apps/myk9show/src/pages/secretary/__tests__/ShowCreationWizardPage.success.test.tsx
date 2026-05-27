import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import type { ShowPasscodes } from '@myk9/core';
import { render } from '@/test/utils/testUtils';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// Capture the onCreated callback the page passes to the hook so we can
// trigger it directly in tests — avoids navigating through wizard steps.
// Signature mirrors useShowCreationWizardActions: the hook calls back with
// (showId, showName, passcodes) where passcodes are the server-generated
// plaintexts returned by insert_show_passcodes (PR #375 removed the legacy
// client-side derivation from showId).
let capturedOnCreated:
  | ((id: string, name: string, passcodes: ShowPasscodes | null) => void)
  | undefined;

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: (opts: {
    onCreated?: (id: string, name: string, passcodes: ShowPasscodes | null) => void;
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

// Sample server-issued plaintexts — what insert_show_passcodes would return.
// Role-letter prefix matches the alphabet defined in @myk9/core/passcodes
// (admin=a, judge=j, steward=s, exhibitor=e); the remaining chars are
// arbitrary fixture data, not derived from showId.
const FIXTURE_PASSCODES: ShowPasscodes = {
  admin: 'ax7k2',
  judge: 'jm9q4',
  steward: 'sp3n8',
  exhibitor: 'eh5d1',
};

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

  it('shows the success overlay with server-issued passcodes after show creation', () => {
    render(<ShowCreationWizardPage />);

    // Simulate the hook calling onCreated after a successful save.
    // The third arg models the plaintexts returned by insert_show_passcodes;
    // they are forwarded into MyK9QAccessCard's `passcodes` prop and
    // rendered verbatim. The legacy `generatePasscodesFromShowId` fallback
    // was removed in PR #375 because the server now stores random hashed
    // codes that no derivation could match.
    act(() => {
      capturedOnCreated?.(
        '63165809-e025-25c6-6cf9-979f63165809',
        'Spring Trial',
        FIXTURE_PASSCODES
      );
    });

    expect(screen.getByText('Show Created!')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_PASSCODES.admin)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_PASSCODES.judge)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_PASSCODES.steward)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_PASSCODES.exhibitor)).toBeInTheDocument();
  });

  it('navigates to the dashboard when Go to Dashboard is clicked', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    act(() => {
      capturedOnCreated?.(
        '63165809-e025-25c6-6cf9-979f63165809',
        'Spring Trial',
        FIXTURE_PASSCODES
      );
    });

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/secretary/dashboard');
  });
});
