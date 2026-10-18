import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubOnboarding } from '../ClubOnboarding';
import { BANNED_COPY } from '../lifecycleStories';

const mockSubmit = vi.fn();
const mockGetRequests = vi.fn();
const auth = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email: string;
    user_metadata: { firstName: string; lastName: string };
  },
}));
const signedInUser = {
  id: 'user-1',
  email: 'club@example.com',
  user_metadata: { firstName: 'Pat', lastName: 'Morgan' },
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth,
}));

vi.mock('@/services/database/onboarding-requests', () => ({
  submitOnboardingRequest: (...args: unknown[]) => mockSubmit(...args),
  getMyOnboardingRequests: (...args: unknown[]) => mockGetRequests(...args),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/club name/i), {
    target: { value: 'Tri-State Kennel Club' },
  });
  fireEvent.change(screen.getByLabelText(/organization/i), { target: { value: 'AKC' } });
  fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: 'Pat Morgan' } });
  fireEvent.change(screen.getByLabelText(/contact email/i), {
    target: { value: 'club@example.com' },
  });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /submit request/i }).closest('form')!);
}

describe('ClubOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = signedInUser;
    mockGetRequests.mockResolvedValue([]);
  });

  it('shows a friendly message when an active request wins a concurrent submit', async () => {
    mockSubmit.mockRejectedValue({ code: '23505', message: 'duplicate key value' });
    render(<ClubOnboarding />, { initialRoute: '/' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    );
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '123' } });
    submitForm();

    await waitFor(() =>
      expect(screen.getByText(/already have a request under review/i)).toBeInTheDocument()
    );
  });

  describe('club numbers (MYK9-1235)', () => {
    async function openForm() {
      render(<ClubOnboarding />, { initialRoute: '/' });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
      );
      fillRequiredFields();
    }

    it('asks for an AKC, UKC and ASCA club number', async () => {
      await openForm();
      for (const label of ['AKC club number', 'UKC club number', 'ASCA club number']) {
        expect(screen.getByLabelText(label)).toBeInTheDocument();
      }
      expect(screen.getByText(/enter at least one/i)).toBeInTheDocument();
    });

    it('refuses to submit with no club number', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: '   ' } });
      submitForm();

      expect(await screen.findByText('Enter at least one club number.')).toBeInTheDocument();
      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('submits an AKC-only club with just that number', async () => {
      mockSubmit.mockResolvedValue(undefined);
      await openForm();
      fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: ' 4521 ' } });
      submitForm();

      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { AKC: '4521' } })
      );
    });

    it('submits a UKC-only club with just that number', async () => {
      mockSubmit.mockResolvedValue(undefined);
      await openForm();
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-9' } });
      submitForm();
      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { UKC: 'U-9' } })
      );
    });

    it('sends every number entered when a club has two', async () => {
      mockSubmit.mockResolvedValue(undefined);
      await openForm();
      fireEvent.change(screen.getByLabelText('AKC club number'), { target: { value: '4521' } });
      fireEvent.change(screen.getByLabelText('UKC club number'), { target: { value: 'U-9' } });
      submitForm();
      await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clubNumbers: { AKC: '4521', UKC: 'U-9' } })
      );
    });
  });

  it('leads with the club heading', () => {
    render(<ClubOnboarding />, { initialRoute: '/' });
    expect(
      screen.getByRole('heading', { level: 2, name: /add your club to myk9show/i })
    ).toBeInTheDocument();
  });

  it('contains no banned copy in the signed-out state', () => {
    auth.user = null;
    const { container } = render(<ClubOnboarding />);
    for (const re of BANNED_COPY) expect(container.textContent ?? '').not.toMatch(re);
  });
});
