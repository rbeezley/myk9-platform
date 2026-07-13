/**
 * Covers the registration confirmation email wiring:
 * the "Email Confirmation" action must invoke the real
 * `send-registration-email` sender with the registration id, must be
 * idempotent across repeated clicks, and must fall back to clipboard on
 * failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, userEvent } from '@/test/utils/testUtils';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { ConfirmationStep } from '../ConfirmationStep';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

// Mocks referenced inside vi.mock factories must be created via vi.hoisted so
// they exist when the hoisted factory runs.
const { sendMock, notificationsMock, loggerMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  notificationsMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock the sender so we never touch Supabase / Resend.
vi.mock('../sendRegistrationConfirmationEmail', () => ({
  sendRegistrationConfirmationEmail: (registrationId: string) => sendMock(registrationId),
}));

// Mock notifications to assert which toast fires without rendering sonner.
vi.mock('@/lib/notifications', () => ({
  notifications: notificationsMock,
}));

// Override only `logger` so the send-failure path's diagnostic log is assertable
// without hitting real transports. Preserve the rest of the module (the
// `LoggingService` singleton is used transitively by dateFormat → dateLocal).
vi.mock('@/services/LoggingService', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/LoggingService')>();
  return { ...actual, logger: loggerMock };
});

// Empty stores keep the heavy receipt cards inert; we only exercise the action.
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [{ id: 'show-1', name: 'Spring Trial', startDate: '2026-05-01' }],
  }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({ trials: [] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [] }),
}));

// Stub the heavy child panel — it isn't under test here.
vi.mock('../RegistrationManagementPanel', () => ({
  RegistrationManagementPanel: () => null,
}));

const baseProps = {
  registrationNumber: 'REG-001',
  registrationId: 'enrollment-123',
  selectedDogs: [] as string[],
  classSelections: [],
  documents: [] as File[],
  paymentMethod: 'check',
  paymentStatus: PaymentStatus.PENDING,
  entryStatus: EntryStatus.PENDING,
  totalFees: 50,
  showId: 'show-1',
};

function clickEmailButton() {
  return userEvent.setup().click(screen.getByRole('button', { name: /email confirmation/i }));
}

describe('ConfirmationStep — email confirmation', () => {
  beforeEach(() => {
    sendMock.mockReset();
    notificationsMock.success.mockReset();
    notificationsMock.error.mockReset();
    notificationsMock.info.mockReset();
    loggerMock.error.mockReset();
  });

  it('sends the registration confirmation email with the registration id', async () => {
    sendMock.mockResolvedValue({ ok: true });

    render(<ConfirmationStep {...baseProps} />);
    await clickEmailButton();

    // Assertion-first: the completion path must call the real sender with the
    // enrollment/registration id.
    await waitFor(() => expect(sendMock).toHaveBeenCalledWith('enrollment-123'));
    expect(notificationsMock.success).toHaveBeenCalledWith(
      'Confirmation email sent',
      expect.objectContaining({ description: expect.stringContaining('inbox') })
    );
  });

  it('does not double-send on a second click after success (idempotent)', async () => {
    sendMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConfirmationStep {...baseProps} />);
    const button = screen.getByRole('button', { name: /email confirmation/i });

    await user.click(button);
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));

    await user.click(button);
    // Still only one network send; the repeat surfaces an info toast instead.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(notificationsMock.info).toHaveBeenCalledWith(
      'Confirmation email already sent',
      expect.any(Object)
    );
  });

  it('falls back to clipboard and surfaces an error when the send fails', async () => {
    sendMock.mockResolvedValue({ ok: false, error: 'boom' });

    render(<ConfirmationStep {...baseProps} />);
    // Spy AFTER render: render() calls userEvent.setup() which installs its own
    // navigator.clipboard stub the first time it runs in a worker, replacing
    // whatever object existed before. Spying earlier wraps the pre-userEvent
    // object and the spy is lost under --sequence.shuffle (writeText never fires).
    // fireEvent (not userEvent) so userEvent's clipboard stub doesn't shadow it.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: /email confirmation/i }));

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith('enrollment-123'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(notificationsMock.error).toHaveBeenCalledWith(
      'Could not send confirmation email',
      expect.any(Object)
    );
    // The failure cause is logged with the registration context for field diagnostics.
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Registration confirmation email failed to send',
      'registration',
      expect.objectContaining({ registrationId: 'enrollment-123' }),
      expect.any(Error)
    );
  });

  it('disables the button and shows a sending state while the send is in flight', async () => {
    // Hold the send pending so the in-flight UI is observable.
    let resolveSend: (value: { ok: boolean }) => void = () => {};
    sendMock.mockReturnValue(
      new Promise<{ ok: boolean }>(resolve => {
        resolveSend = resolve;
      })
    );

    render(<ConfirmationStep {...baseProps} />);
    await clickEmailButton();

    // While pending, the button is disabled and labelled "Sending…" — refs alone
    // can't drive this, so it proves the display state is wired.
    const sendingButton = await screen.findByRole('button', { name: /sending/i });
    expect(sendingButton).toBeDisabled();

    // Settle so no work is left pending past the test.
    resolveSend({ ok: true });
    await waitFor(() =>
      expect(notificationsMock.success).toHaveBeenCalledWith(
        'Confirmation email sent',
        expect.any(Object)
      )
    );
  });

  it('copies to clipboard (no edge call) when no registration id is present', async () => {
    render(<ConfirmationStep {...baseProps} registrationId={undefined} />);
    // Spy AFTER render so we wrap the live clipboard userEvent.setup() installed
    // during render (see the send-failure test above for the full rationale).
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: /email confirmation/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(sendMock).not.toHaveBeenCalled();
    expect(notificationsMock.success).toHaveBeenCalledWith(
      'Receipt copied to clipboard',
      expect.any(Object)
    );
  });
});

describe('ConfirmationStep — capacity outcomes', () => {
  it('explains created, waitlisted, and denied selections without implying payment is due', () => {
    render(
      <ConfirmationStep
        {...baseProps}
        entryOutcomes={[
          {
            dogId: 'dog-1',
            classId: 'class-1',
            outcome: 'created',
            entryId: 'entry-1',
            waitlistEntryId: null,
            feeCents: 2500,
            capacityOverride: false,
          },
          {
            dogId: 'dog-2',
            classId: 'class-2',
            outcome: 'waitlisted',
            entryId: null,
            waitlistEntryId: 'wait-2',
            waitlistPosition: 3,
            feeCents: 0,
            capacityOverride: false,
          },
          {
            dogId: 'dog-3',
            classId: 'class-3',
            outcome: 'denied',
            entryId: null,
            waitlistEntryId: null,
            feeCents: 0,
            capacityOverride: false,
          },
        ]}
      />
    );

    expect(screen.getByText(/1 entry submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/1 selection joined the wait list/i)).toBeInTheDocument();
    expect(screen.getByText(/payment is not due unless a spot is offered/i)).toBeInTheDocument();
    expect(
      screen.getByText(/1 selection could not be entered because it is full/i)
    ).toBeInTheDocument();
  });

  it('does not claim registration success when every selection was denied', () => {
    render(
      <ConfirmationStep
        {...baseProps}
        entryOutcomes={[
          {
            dogId: 'dog-1',
            classId: 'class-1',
            outcome: 'denied',
            entryId: null,
            waitlistEntryId: null,
            feeCents: 0,
            capacityOverride: false,
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'No entries were added' })).toBeInTheDocument();
    expect(screen.queryByText('Registration Submitted')).not.toBeInTheDocument();
  });
});
