export type WaitlistNotificationEventType = 'offered' | 'reminder' | 'expired';

export interface WaitlistNotificationPayload {
  event_id: string;
  waitlist_entry_id: string;
  event_type: WaitlistNotificationEventType;
}

export interface WaitlistNotificationContent {
  title: string;
  subject: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  emailHtml: string;
}

export interface WaitlistDeliveryState {
  eventType: WaitlistNotificationEventType;
  eventOfferCycleAt: string;
  currentOfferCycleAt: string | null;
  waitlistStatus: string | null;
  joinedVia: string | null;
  entryStatus: string | null;
  paymentStatus: string | null;
  expiresAt: string | null;
  nowMs: number;
}

export interface WaitlistDeliveryChannel {
  name: 'email' | 'push';
  deliver: () => Promise<void>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set<WaitlistNotificationEventType>(['offered', 'reminder', 'expired']);

export function parseWaitlistNotificationPayload(value: unknown): WaitlistNotificationPayload {
  if (!value || typeof value !== 'object') throw new Error('Invalid payload');
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.event_id !== 'string' ||
    !UUID_PATTERN.test(candidate.event_id) ||
    typeof candidate.waitlist_entry_id !== 'string' ||
    !UUID_PATTERN.test(candidate.waitlist_entry_id) ||
    typeof candidate.event_type !== 'string' ||
    !EVENT_TYPES.has(candidate.event_type as WaitlistNotificationEventType)
  ) {
    throw new Error('Invalid payload');
  }

  return {
    event_id: candidate.event_id,
    waitlist_entry_id: candidate.waitlist_entry_id,
    event_type: candidate.event_type as WaitlistNotificationEventType,
  };
}

export function buildWaitlistNotificationContent(input: {
  eventType: WaitlistNotificationEventType;
  waitlistEntryId: string;
  recipientName: string;
  dogName: string;
  className: string;
  showName: string;
  expiresAt: string | null;
  timezone: string | null;
  appOrigin: string;
}): WaitlistNotificationContent {
  const actionUrl = `${input.appOrigin.replace(/\/$/, '')}/exhibitor/entries?waitlistOffer=${encodeURIComponent(input.waitlistEntryId)}`;
  const copy = eventCopy(input.eventType);
  const deadline = input.expiresAt
    ? new Date(input.expiresAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: normalizeTimeZone(input.timezone),
      })
    : null;
  const deadlineHtml =
    input.eventType !== 'expired' && deadline
      ? `<p style="margin:16px 0;color:#78350f"><strong>Held until:</strong> ${escapeHtml(deadline)}</p>`
      : '';

  return {
    title: copy.title,
    subject: `${copy.title} — ${input.showName}`,
    body: copy.body(input.dogName, input.className, input.showName),
    actionLabel: copy.actionLabel,
    actionUrl,
    emailHtml: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;background:#f3f4f6;margin:0;padding:24px">
<main style="max-width:600px;margin:auto;background:#fff;border-radius:8px;padding:28px">
<h1 style="font-size:24px;margin:0 0 20px">${escapeHtml(copy.title)}</h1>
<p>Hi ${escapeHtml(input.recipientName || 'there')},</p>
<p>${escapeHtml(copy.body(input.dogName, input.className, input.showName))}</p>
${deadlineHtml}
<p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(copy.actionLabel)}</a></p>
<p style="color:#6b7280;font-size:14px">You can always return to My Entries to check the current status.</p>
</main></body></html>`,
  };
}

export function shouldDeliverWaitlistEvent(state: WaitlistDeliveryState): boolean {
  const eventCycleMs = Date.parse(state.eventOfferCycleAt);
  const currentCycleMs = state.currentOfferCycleAt ? Date.parse(state.currentOfferCycleAt) : NaN;
  if (
    state.joinedVia === 'mail_in' ||
    !Number.isFinite(eventCycleMs) ||
    eventCycleMs !== currentCycleMs ||
    state.paymentStatus === 'paid'
  ) {
    return false;
  }

  if (state.eventType === 'expired') {
    return state.waitlistStatus === 'expired';
  }

  if (
    state.waitlistStatus !== 'offered' ||
    state.entryStatus !== 'pending-payment' ||
    !state.expiresAt
  ) {
    return false;
  }

  const expiresAtMs = Date.parse(state.expiresAt);
  return Number.isFinite(expiresAtMs) && state.nowMs < expiresAtMs;
}

export async function runWaitlistDeliveryChannels(
  channels: WaitlistDeliveryChannel[]
): Promise<string[]> {
  const results = await Promise.allSettled(channels.map(channel => channel.deliver()));
  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [redactWaitlistDeliveryError(result.reason) || `${channels[index].name}_delivery_error`]
      : []
  );
}

export function redactWaitlistDeliveryError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { channel?: unknown; statusCode?: unknown };
    if (
      (candidate.channel === 'email' || candidate.channel === 'push') &&
      typeof candidate.statusCode === 'number'
    ) {
      return `${candidate.channel}_http_${candidate.statusCode}`;
    }
  }
  return 'delivery_error';
}

function eventCopy(eventType: WaitlistNotificationEventType) {
  switch (eventType) {
    case 'offered':
      return {
        title: 'A spot is ready for you',
        actionLabel: 'Complete your entry',
        body: (dog: string, entryClass: string, show: string) =>
          `${dog} has been offered a spot in ${entryClass} at ${show}.`,
      };
    case 'reminder':
      return {
        title: 'Your waitlist spot is still waiting',
        actionLabel: 'Complete your entry',
        body: (dog: string, entryClass: string, show: string) =>
          `There is still time to complete ${dog}'s entry in ${entryClass} at ${show}.`,
      };
    case 'expired':
      return {
        title: 'Your waitlist offer has ended',
        actionLabel: 'View your entries',
        body: (dog: string, entryClass: string, show: string) =>
          `${dog}'s offer for ${entryClass} at ${show} has ended. No payment was taken.`,
      };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

function normalizeTimeZone(timezone: string | null): string {
  if (!timezone) return 'America/Chicago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return 'America/Chicago';
  }
}
