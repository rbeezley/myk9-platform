import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildSecretaryRegistrationPath } from '@/pages/RegistrationWizardPage.routes';

export interface QuickLinkShow {
  id: string;
  name: string;
}

interface DashboardQuickLinksProps {
  /** Live shows where the viewer may add an entry (see `filterEntryEligibleShows`). */
  entryShows: readonly QuickLinkShow[];
}

const TILE_CLASS =
  'flex min-h-11 items-center justify-center gap-1 rounded-md border border-border bg-card px-1.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:px-2 sm:text-sm';

// Add Dog / Add Person live on /dogs and /people; the entry flow creates both inline.
export function DashboardQuickLinks({ entryShows }: DashboardQuickLinksProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [onlyShow] = entryShows;

  return (
    <nav className="px-5 pb-3" aria-label="Dashboard quick links">
      <div data-testid="dashboard-quick-links-row" className="grid grid-cols-2 gap-2">
        <Link to="/secretary/create-show/wizard" className={TILE_CLASS}>
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Add Show</span>
        </Link>
        {entryShows.length === 0 ? (
          <button
            type="button"
            disabled
            aria-describedby="add-entry-reason"
            className={`${TILE_CLASS} cursor-not-allowed opacity-60`}
          >
            <ClipboardPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">Add Entry</span>
          </button>
        ) : entryShows.length === 1 && onlyShow ? (
          <Link to={buildSecretaryRegistrationPath(onlyShow.id)} className={TILE_CLASS}>
            <ClipboardPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">Add Entry</span>
          </Link>
        ) : (
          <button type="button" onClick={() => setPickerOpen(true)} className={TILE_CLASS}>
            <ClipboardPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">Add Entry</span>
          </button>
        )}
      </div>
      {entryShows.length === 0 && (
        <p id="add-entry-reason" className="mt-1.5 text-xs text-muted-foreground">
          Add Entry needs a published show you run as trial secretary.
        </p>
      )}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add entry to which show?</DialogTitle>
            <DialogDescription>Pick the show you are keying an entry for.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {entryShows.map(show => (
              <li key={show.id}>
                <Link
                  to={buildSecretaryRegistrationPath(show.id)}
                  onClick={() => setPickerOpen(false)}
                  className="flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {show.name}
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
