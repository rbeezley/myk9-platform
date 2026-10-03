import { ArmbandLookup } from '@/components/shows/ArmbandLookup';

/**
 * The show page header's own content: the armband lookup, a search tool rather
 * than an action on the show. There is no Edit button here: Edit show is the
 * first item of the header Actions menu on every page (MYK9-928, reversing the
 * MYK9-904 exception), which opens the same Show Edit panel.
 */
export function ShowPageHeaderActions({
  showId,
  armbandCount,
}: {
  showId: string | undefined;
  armbandCount: number | undefined;
}) {
  // Shown whenever the count is positive OR UNKNOWN (loading, offline, failed):
  // `?? 0` would read an unread count as zero and leave nothing to retry.
  if (!showId) return null;
  return armbandCount == null || armbandCount > 0 ? <ArmbandLookup showId={showId} /> : null;
}
