import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntryAgreementSection } from '../EntryAgreementSection';

// Mock the hook
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: vi.fn(),
}));

import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';

const mockHook = useOrganizationAgreement as ReturnType<typeof vi.fn>;

const baseProps = {
  organization: 'AKC',
  agreed: false,
  onAgree: vi.fn(),
};

describe('EntryAgreementSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.mockReturnValue({
      data: {
        organization: 'AKC',
        agreement_text: 'I certify that I am the actual owner of the dog...',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders collapsible with org name in header', () => {
    render(<EntryAgreementSection {...baseProps} />);
    expect(screen.getByText('AKC Entry Agreement')).toBeInTheDocument();
  });

  it('shows agreement text when expanded', async () => {
    const user = userEvent.setup();
    render(<EntryAgreementSection {...baseProps} />);

    // Click to expand
    await user.click(screen.getByText('AKC Entry Agreement'));

    expect(screen.getByText(/I certify that I am the actual owner/)).toBeInTheDocument();
  });

  it('checkbox is always visible regardless of collapsed state', () => {
    render(<EntryAgreementSection {...baseProps} />);
    expect(
      screen.getByRole('checkbox', {
        name: /I have read and agree to the AKC entry agreement/,
      })
    ).toBeInTheDocument();
  });

  it('checkbox is unchecked by default', () => {
    render(<EntryAgreementSection {...baseProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('calls onAgree callback when checkbox toggled', async () => {
    const user = userEvent.setup();
    const onAgree = vi.fn();
    render(<EntryAgreementSection {...baseProps} onAgree={onAgree} />);

    await user.click(screen.getByRole('checkbox'));
    expect(onAgree).toHaveBeenCalledWith(true);
  });

  it('shows skeleton when loading', () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<EntryAgreementSection {...baseProps} />);
    expect(screen.getByTestId('agreement-skeleton')).toBeInTheDocument();
  });

  it('shows error message with retry when query fails', async () => {
    const refetch = vi.fn();
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();
    render(<EntryAgreementSection {...baseProps} />);

    expect(screen.getByText(/could not load the .* entry agreement/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  // Resolved with no row means this organization has no agreement configured —
  // a configuration fact, not a failure. Rendering nothing is correct, and the
  // wizard's gate does not ask for a tick in this state. Only 'AKC' is seeded,
  // so treating this as an error blocked every UKC and ASCA show permanently.
  it('renders nothing when the organization has no agreement configured', () => {
    mockHook.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(<EntryAgreementSection {...baseProps} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
});
