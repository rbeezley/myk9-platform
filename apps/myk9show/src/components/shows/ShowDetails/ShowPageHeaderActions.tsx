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
  return (armbandCount ?? 0) > 0 && showId ? <ArmbandLookup showId={showId} /> : null;
}
