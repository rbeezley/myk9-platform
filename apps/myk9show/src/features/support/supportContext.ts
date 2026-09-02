import { UserRole } from '@/types/auth-types';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`, 'i');

export interface SupportRouteContext {
  showId: string | null;
  trialId: string | null;
  entryId: string | null;
  isShowDayContext: boolean;
}

export function extractSupportRouteContext(pathname: string, search = ''): SupportRouteContext {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const showId =
    readUuidParam(params, 'showId') ??
    matchUuid(pathname, new RegExp(`/(?:secretary/)?shows/(${UUID_PATTERN})`, 'i')) ??
    matchUuid(pathname, new RegExp(`/at-show/(${UUID_PATTERN})`, 'i'));
  const trialId =
    readUuidParam(params, 'trialId') ??
    matchUuid(pathname, new RegExp(`/trials/(${UUID_PATTERN})`, 'i'));
  const entryId =
    readUuidParam(params, 'entryId') ??
    readUuidParam(params, 'resultEntryId') ??
    matchUuid(pathname, new RegExp(`/entries/(${UUID_PATTERN})`, 'i'));

  return {
    showId,
    trialId,
    entryId,
    isShowDayContext:
      pathname.includes('/at-show') ||
      pathname.includes('/show-desk') ||
      pathname.includes('/secretary/day-of'),
  };
}

export function shouldPrioritizeSupportTicket(
  context: SupportRouteContext,
  roles: UserRole[]
): boolean {
  return context.isShowDayContext && roles.includes(UserRole.SECRETARY);
}

function readUuidParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && UUID_RE.test(value) ? value : null;
}

function matchUuid(pathname: string, pattern: RegExp): string | null {
  const match = pathname.match(pattern)?.[1];
  return match && UUID_RE.test(match) ? match : null;
}
