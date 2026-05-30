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
