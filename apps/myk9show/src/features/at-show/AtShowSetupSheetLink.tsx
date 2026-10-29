import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AtShowClassGroup } from './atShowClassListAdapter';
import { atShowSetupSheetPath, setupSheetRegistryIds } from './setupSheetRegistries';

/**
 * Judge's way to the printable setup cheat sheet (MYK9-1078). The sheet itself is the
 * secretary Reports card's component, so this is only a door: it renders nothing for a
 * show whose registries have no sheet (ASCA).
 */
export function AtShowSetupSheetLink({
  showId,
  groups,
  isExhibitorOnly,
}: {
  showId: string | undefined;
  groups: readonly AtShowClassGroup[];
  /** An exhibitor-only account is not setting up searches; they never see the door. */
  isExhibitorOnly: boolean;
}) {
  if (isExhibitorOnly || !showId || setupSheetRegistryIds(groups).length === 0) return null;
  return (
    <div className="mb-4 flex justify-center">
      <Button asChild variant="outline" className="min-h-11 gap-2 px-4">
        <Link to={atShowSetupSheetPath(showId)}>
          <FileText className="h-4 w-4" aria-hidden />
          Judge setup cheat sheet
        </Link>
      </Button>
    </div>
  );
}
