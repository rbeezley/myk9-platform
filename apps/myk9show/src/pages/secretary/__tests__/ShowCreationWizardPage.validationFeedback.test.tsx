import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ShowCreationWizardPage from '../ShowCreationWizardPage';

// The wizard's Step 1 "Next" used to sit disabled while required fields were
// missing, so clicking it did nothing and gave the secretary no clue why
// (audit finding #2, docs/audits/2026-07-01-show-creation-wizard-ux.md). These
// tests pin the corrected behavior: Next stays clickable, an inline count hints
// at what's missing, and the click surfaces + scrolls to the validation banner.

vi.mock('@/pages/secretary/ShowCreationWizard/useShowCreationWizardActions', () => ({
  useShowCreationWizardActions: () => ({
    handleSaveDraft: vi.fn(),
    handleCreateShow: vi.fn(),
    handleCreateAndPublish: vi.fn(),
    handleSaveProgress: vi.fn(),
  }),
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

describe('ShowCreationWizardPage — Step 1 Next-button feedback', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNavigate.mockReset();
    // jsdom does not implement scrollIntoView; spy on it so we can assert the
    // banner is scrolled into view without it throwing.
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves the Next button enabled when required fields are missing', () => {
    // A fresh wizard resets to Step 1 with required fields blank.
    render(<ShowCreationWizardPage />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('shows an inline "N items remaining" hint before any click', () => {
    render(<ShowCreationWizardPage />);

    // "items", not "required fields" — the count also covers non-field issues
    // like date ordering, so the label stays honest on every step.
    expect(screen.getByText(/\d+ items? remaining/i)).toBeInTheDocument();
  });

  it('surfaces and scrolls to the validation banner when Next is clicked with missing fields', async () => {
    const { user } = render(<ShowCreationWizardPage />);

    // No banner (role="alert") until the secretary actually attempts to advance.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));

    // Banner explains what's blocking, and we scroll it into view.
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/\d+ items? needs? attention/i);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
