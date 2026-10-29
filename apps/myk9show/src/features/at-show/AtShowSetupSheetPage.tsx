/**
 * AtShowSetupSheetPage: the judge's printable setup cheat sheet (MYK9-1078).
 *
 * Renders the same `SetupCheatSheet` the secretary Reports card prints, so the two entry points
 * can never disagree. The sheet is static rulebook data, so this works offline; the registry
 * comes from the show's trials. The toolbar is hidden when printing so only the sheet pages
 * reach the paper.
 */
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSetupSheet } from '@/features/registries';
import { SetupCheatSheet } from '@/components/reports/setupCheatSheet/SetupCheatSheet';
import { useAtShowClassList } from './useAtShowClassList';
import { setupSheetRegistryIds } from './setupSheetRegistries';

export function AtShowSetupSheetPage() {
  const { showId } = useParams<{ showId: string }>();
  const { groups, isLoading } = useAtShowClassList(showId);
  const registryIds = setupSheetRegistryIds(groups);

  return (
    <main className="ringside-root px-4 py-4 print:p-0">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" className="min-h-11 gap-2 px-3">
          <Link to={`/at-show/${encodeURIComponent(showId ?? '')}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to classes
          </Link>
        </Button>
        {registryIds.length > 0 && (
          <Button className="min-h-11 gap-2 px-4" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
        )}
      </div>

      {registryIds.length === 0 ? (
        <p role="status" className="py-12 text-center text-muted-foreground print:hidden">
          {isLoading
            ? 'Loading the setup cheat sheet...'
            : 'There is no setup cheat sheet for this show’s registry.'}
        </p>
      ) : (
        // The sheet is a fixed 10.5in wide so it prints at 100%; on a phone it scrolls sideways.
        <div className="overflow-x-auto print:overflow-visible">
          {registryIds.map(registryId => {
            const sheet = getSetupSheet(registryId);
            return sheet ? <SetupCheatSheet key={registryId} sheet={sheet} /> : null;
          })}
        </div>
      )}
    </main>
  );
}

export default AtShowSetupSheetPage;
