/**
 * The number ring alerts are sent from, for display in settings (MYK9-192).
 *
 * "Reply START to turn alerts back on" is unusable advice six months later:
 * the exhibitor has long since deleted the message thread, so there is nothing
 * left to reply to. The number has to be on screen.
 *
 * It comes from configuration rather than a constant because it differs
 * between the Twilio sandbox and the live Messaging Service, and a wrong number
 * here sends someone's START into the void. When it is absent we say so and
 * point at support instead of printing a placeholder — an invented number is
 * worse than an admission, because the exhibitor would text it and conclude the
 * opt-out is permanent.
 */

/** Renders +12105550142 as (210) 555-0142; anything else is passed through. */
export function formatSmsSendingNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return raw.trim();
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function getSmsSendingNumber(
  env: { VITE_SMS_SENDING_NUMBER?: string } = import.meta.env
): string | null {
  const configured = env.VITE_SMS_SENDING_NUMBER?.trim();
  return configured ? formatSmsSendingNumber(configured) : null;
}
