export type TargetType = 'class' | 'checked_in' | 'all_show';

export interface EntryRecipientSource {
  armband: string | null;
  authUserIds: Array<string | null | undefined>;
}

export interface RingsideSessionSource {
  subscriptionId: string;
  role: 'exhibitor' | 'steward' | 'judge' | 'admin';
  favoritedArmbands: string[];
  lastSeenAt: string | null;
  lastSeenRoute: string | null;
}

export interface CallerRoleSource {
  club_id: string | null;
  show_id?: string | null;
  roles?: { name?: string | null } | null;
}

export const RINGSIDE_SESSION_PUSH_TARGET_SELECT =
  'subscription_id, role, favorited_armbands, last_seen_at, last_seen_route, push_subscriptions!inner(id, endpoint, p256dh, auth)';

export const CALLER_ROLE_SELECT =
  'id, club_id, show_id, auth_user_id, is_active, roles!inner(name)';

export function normalizeTargetType(value: unknown): TargetType {
  return value === 'checked_in' || value === 'all_show' ? value : 'class';
}

export function uniqueAccountRecipients(
  entries: EntryRecipientSource[],
  senderId: string
): string[] {
  const recipients = new Set<string>();
  for (const entry of entries) {
    for (const authUserId of entry.authUserIds) {
      if (authUserId && authUserId !== senderId) recipients.add(authUserId);
    }
  }
  return [...recipients];
}

export function callerRoleAuthorizesShow(
  role: CallerRoleSource,
  show: { id: string; club_id: string | null }
): boolean {
  const roleName = role.roles?.name;
  if (roleName === 'platform_admin' || roleName === 'site_admin') return true;
  if (roleName !== 'secretary' && roleName !== 'trial_secretary') return false;
  return role.club_id === show.club_id || role.show_id === show.id;
}

export function targetArmbands(entries: EntryRecipientSource[]): string[] {
  return [...new Set(entries.map(entry => entry.armband?.trim()).filter(Boolean) as string[])];
}

export function ringsideSessionMatchesTarget(
  session: RingsideSessionSource,
  targetType: TargetType,
  armbands: string[]
): boolean {
  // Targeted secretary messages are exhibitor-facing; judge/steward passcode
  // sessions are intentionally excluded until staff broadcasts are split out.
  if (session.role !== 'exhibitor') return false;
  if (targetType === 'all_show') return true;
  if (armbands.length === 0) return false;
  const targetSet = new Set(armbands.map(armband => armband.toLowerCase()));
  return session.favoritedArmbands.some(armband => targetSet.has(armband.toLowerCase()));
}

export function isPresenceSuppressed(
  session: Pick<RingsideSessionSource, 'lastSeenAt' | 'lastSeenRoute'>,
  nowMs = Date.now()
): boolean {
  if (!session.lastSeenAt || !session.lastSeenRoute?.startsWith('/at-show')) return false;
  const lastSeenMs = Date.parse(session.lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return false;
  return nowMs - lastSeenMs <= 60_000;
}

export function buildGroupLabel(args: {
  targetType: TargetType;
  classNumber?: number | string | null;
  className?: string | null;
}): string {
  if (args.targetType === 'checked_in') return 'Sent to everyone checked in';
  if (args.targetType === 'all_show') return 'Sent to everyone in the show';

  if (args.classNumber || args.className) {
    const classId = args.classNumber ? `Class ${args.classNumber}` : 'class';
    return `Sent to all ${classId}${args.className ? ` (${args.className})` : ''} exhibitors`;
  }

  return 'Sent to all class exhibitors';
}

export function buildRingsidePushActionUrl(
  showId: string,
  session: Pick<RingsideSessionSource, 'lastSeenRoute'>
): string {
  const fallback = `/at-show/${showId}`;
  const route = session.lastSeenRoute?.trim();
  if (!route) return fallback;
  return route === fallback || route.startsWith(`${fallback}/`) ? route : fallback;
}
