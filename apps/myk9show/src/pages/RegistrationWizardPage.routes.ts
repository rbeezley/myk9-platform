import {
  ENTRY_EXHIBITOR_PARAM,
  ENTRY_RETURN_FORM_PARAM,
} from '@/features/registration/entryExhibitorContext';

export function isShowDeskLateEntryMode(searchParams: URLSearchParams): boolean {
  return searchParams.get('source') === 'show-desk' && searchParams.get('entryMode') === 'late';
}

export function buildExhibitorRegistrationPath(showId: string): string {
  return `/shows/${encodeURIComponent(showId)}/register`;
}

export function buildSecretaryRegistrationPath(showId: string): string {
  return `/secretary/register/${encodeURIComponent(showId)}`;
}

/**
 * "Add entry for <exhibitor>" from an entry form (MYK9-1594): the secretary wizard opened on that
 * person's dogs, returning to the same form afterwards. `formKey` is the form's `registration`
 * key on Entry Forms.
 */
export function buildAddEntryForExhibitorPath(
  showId: string,
  exhibitorId: string,
  formKey: string
): string {
  const params = new URLSearchParams({
    [ENTRY_EXHIBITOR_PARAM]: exhibitorId,
    [ENTRY_RETURN_FORM_PARAM]: formKey,
  });
  return `${buildSecretaryRegistrationPath(showId)}?${params.toString()}`;
}

export function buildShowDeskLateEntryPath(showId: string): string {
  return `${buildSecretaryRegistrationPath(showId)}?source=show-desk&entryMode=late`;
}

export function resolveRegistrationExitPath(
  showId: string,
  isLateEntryMode: boolean
): string | null {
  if (!isLateEntryMode) return null;
  // The late-entry door lives on Entries (MYK9-954), so that is where it returns.
  return `/shows/${encodeURIComponent(showId)}/entries`;
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
  opts: { isLateEntryMode: boolean; isInsideSidebar: boolean; returnFormKey?: string | null }
): RegistrationExitTarget {
  // Secretary late entry: return to Entries, where the door lives (MYK9-954).
  if (opts.isLateEntryMode) {
    return {
      path: resolveRegistrationExitPath(showId, true),
      label: 'Back to Entries',
    };
  }
  // "Add entry for <exhibitor>" from an entry form: back to that form (MYK9-1594).
  if (opts.isInsideSidebar && opts.returnFormKey) {
    return {
      path: resolveRegistrationCompletionPath(showId, false, true, opts.returnFormKey),
      label: 'Back to entry form',
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

/** The staff receipt's done button: late entry and mail-in both finish on Entries. */
export const STAFF_RECEIPT_DONE_LABEL = 'Return to Entry Forms';

export function resolveRegistrationCompletionPath(
  showId: string,
  isLateEntryMode: boolean,
  isInsideSidebar = false,
  /** The Entry Forms form the entries were added from; staff flows return to it. */
  returnFormKey: string | null = null
): string {
  const entriesPath = `/shows/${encodeURIComponent(showId)}/entries`;
  if (isLateEntryMode || isInsideSidebar) {
    return returnFormKey
      ? `${entriesPath}?${new URLSearchParams({ registration: returnFormKey }).toString()}`
      : entriesPath;
  }
  return `/shows/${encodeURIComponent(showId)}`;
}
