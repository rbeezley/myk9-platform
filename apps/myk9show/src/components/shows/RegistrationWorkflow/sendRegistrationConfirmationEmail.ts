import { supabase } from '@/lib/supabase';

/**
 * Invokes the `send-registration-email` edge function for a registration
 * (enrollment) id. This is the SAME sender the Entries Management page uses to
 * resend confirmations (see RegistrationView.handleResendEmail) — we reuse it so
 * the wizard's confirmation email is byte-for-byte the one secretaries can later
 * resend, and so idempotency lives in one place.
 *
 * Idempotency: the edge function passes `Idempotency-Key: registrationId` to
 * Resend and writes an `email_log` row, so calling this more than once for the
 * same registration will not deliver a duplicate email. Callers should still
 * guard against firing it repeatedly on re-render (see ConfirmationStep).
 */
export interface SendRegistrationConfirmationResult {
  ok: boolean;
  error?: string;
}

export async function sendRegistrationConfirmationEmail(
  registrationId: string
): Promise<SendRegistrationConfirmationResult> {
  const { error } = await supabase.functions.invoke('send-registration-email', {
    body: { registrationId },
  });

  if (error) {
    return { ok: false, error: error.message ?? 'Failed to send confirmation email' };
  }
  return { ok: true };
}
