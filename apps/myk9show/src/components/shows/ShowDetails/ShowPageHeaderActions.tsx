import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';

/**
 * INTENT: a plainly labelled Edit show button (MYK9-904) so a non-technical
 * secretary finds the editor without opening the Actions menu. Deliberate
 * exception to MYK9-630's "same verb never in both places": Edit stays in the
 * Actions menu too, because the command palette reads that registry. The shell
 * only mounts for managers, so no extra gate here.
 */
export function ShowPageHeaderActions({
  showId,
  armbandCount,
  onEdit,
}: {
  showId: string | undefined;
  armbandCount: number | undefined;
  onEdit: () => void;
}) {
  return (
    <>
      {(armbandCount ?? 0) > 0 && showId ? <ArmbandLookup showId={showId} /> : null}
      <Button type="button" variant="outline" onClick={onEdit}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit show
      </Button>
    </>
  );
}
