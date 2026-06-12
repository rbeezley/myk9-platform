// Operator alert email via Resend direct (the send-email function is
// template-locked). Shared by stripe-webhook and stripe-refund-entry; the
// payout cron keeps its own copy with a payout-specific subject prefix.
// NOTE: unlike most _shared modules this one reads Deno.env, so it has no
// colocated vitest — keep logic trivial enough not to need one.

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const alertEmail = Deno.env.get('PLATFORM_ALERT_EMAIL') ?? 'richardbeezley1@gmail.com';

export async function alertAdmin(subject: string, html: string) {
  if (!resendApiKey) {
    console.log(`Alert email skipped (no RESEND_API_KEY): ${subject}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'myK9Show <notifications@myk9show.com>',
        to: alertEmail,
        subject: `[myK9Show payments] ${subject}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`Alert email failed (${res.status}): ${subject}`);
    }
  } catch (err) {
    console.error(`Alert email error: ${subject}`, err);
  }
}
