export function isShowDeskLateEntryMode(searchParams: URLSearchParams): boolean {
  return searchParams.get('source') === 'show-desk' && searchParams.get('entryMode') === 'late';
}

export function buildExhibitorRegistrationPath(showId: string): string {
  return `/shows/${encodeURIComponent(showId)}/register`;
}

export function buildSecretaryRegistrationPath(showId: string): string {
  return `/secretary/register/${encodeURIComponent(showId)}`;
}

export function buildShowDeskLateEntryPath(showId: string): string {
  return `${buildSecretaryRegistrationPath(showId)}?source=show-desk&entryMode=late`;
}

export function resolveRegistrationExitPath(
  showId: string,
  isLateEntryMode: boolean
): string | null {
  if (!isLateEntryMode) return null;
  return `/shows/${encodeURIComponent(showId)}/show-desk`;
}

/**
 * Where the wizard's top-left exit control goes AND the label that names it
 * (UX walk 4.D — "entry-point labels tell the truth"). A bare "Back" over a
 * history-pop can't state its destination; pairing a deterministic path with a
 * matching label — from one resolver — keeps the two from ever drifting.
 */
export interface RegistrationExitTarget {
  /** Navigation target. `null` means browser back (`navigate(-1)`). */
  path: string | null;
  /** Destination-stating label for the exit button. */
  label: string;
}

export function resolveRegistrationExit(
  showId: string,
  opts: { isLateEntryMode: boolean; isInsideSidebar: boolean }
): RegistrationExitTarget {
  // Secretary show-desk late-entry: return to the Show Desk it launched from.
  if (opts.isLateEntryMode) {
    return {
      path: `/shows/${encodeURIComponent(showId)}/show-desk`,
      label: 'Back to Show Desk',
    };
  }
  // Exhibitor self-service: they arrived from the public show page. Navigate
  // there explicitly (not a history-pop) so the label can honestly name it —
  // and so a refresh/deep-link exit still lands somewhere sensible.
  if (!opts.isInsideSidebar) {
    return {
      path: `/shows/${encodeURIComponent(showId)}`,
      label: 'Back to show',
    };
  }
  // Secretary "Add entries" inside the sidebar: the origin varies within the
  // secretary surface, so fall back to history and keep the label generic.
  return { path: null, label: 'Back' };
}

export function resolveRegistrationCompletionPath(
  showId: string,
  isLateEntryMode: boolean,
  isInsideSidebar = false
): string {
  if (isLateEntryMode) return resolveRegistrationExitPath(showId, true)!;
  if (isInsideSidebar) return `/shows/${encodeURIComponent(showId)}/entry-management`;
  return `/shows/${encodeURIComponent(showId)}`;
}
