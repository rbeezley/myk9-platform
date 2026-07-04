import { HttpError } from '../_shared/http/responses.ts';

export const WAITLIST_INVITE_SECRET_HEADER = 'x-myk9-waitlist-invite-secret';
export const EARLY_ACCESS_ROLE = 'club_official';

export interface WaitlistInviteRow {
  role: string;
  access_invite_sent_at: string | null;
}

export type WaitlistInviteDecision =
  { ok: true; reason: 'send' } | { ok: false; reason: 'role_not_eligible' | 'already_sent' };

function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function assertWaitlistInviteSecret(
  req: Request,
  configuredSecret: string | undefined
): void {
  if (!configuredSecret) {
    throw new HttpError(503, 'Invite verification not configured');
  }

  const provided =
    req.headers.get(WAITLIST_INVITE_SECRET_HEADER) ??
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!provided || !timingSafeEqual(provided, configuredSecret)) {
    throw new HttpError(403, 'Forbidden');
  }
}

export function resolveWaitlistInviteDecision(row: WaitlistInviteRow): WaitlistInviteDecision {
  if (row.role !== EARLY_ACCESS_ROLE) {
    return { ok: false, reason: 'role_not_eligible' };
  }

  if (row.access_invite_sent_at) {
    return { ok: false, reason: 'already_sent' };
  }

  return { ok: true, reason: 'send' };
}
