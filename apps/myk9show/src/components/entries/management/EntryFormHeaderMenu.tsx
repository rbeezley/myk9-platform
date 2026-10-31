import { Mail, MoreHorizontal, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';
import { EnrollmentBulkStatusItems } from './EnrollmentBulkStatusItems';

interface EntryFormHeaderMenuProps {
  exhibitorName: string;
  entries: EntryManagementEntry[];
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  /** Present only when a decision email can be sent for this form. */
  onEmailExhibitor?: (() => void) | undefined;
  /** "Add entry for <exhibitor>": the wizard opened on them, returning here. Absent: not offered. */
  addEntry?: { href: string; disabledReason?: string | undefined } | undefined;
}

/**
 * The one form-level menu, beside the exhibitor's name. Two groups: things done
 * FOR the exhibitor, and things done to ALL entries on the form. A new form-level
 * action is one more item in the matching group.
 */
export function EntryFormHeaderMenu({
  exhibitorName,
  entries,
  onBulkStatusChange,
  onEmailExhibitor,
  addEntry,
}: EntryFormHeaderMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11 shrink-0"
          aria-label={`More actions for ${exhibitorName}`}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {(onEmailExhibitor || addEntry) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {exhibitorName}
              </DropdownMenuLabel>
              {addEntry &&
                (addEntry.disabledReason ? (
                  <DropdownMenuItem disabled title={addEntry.disabledReason} className="min-h-11">
                    <PlusCircle className="h-4 w-4" aria-hidden />
                    <span className="flex flex-col">
                      <span>{`Add entry for ${exhibitorName}`}</span>
                      <span className="text-xs text-muted-foreground">
                        {addEntry.disabledReason}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to={addEntry.href}>
                      <PlusCircle className="h-4 w-4" aria-hidden />
                      {`Add entry for ${exhibitorName}`}
                    </Link>
                  </DropdownMenuItem>
                ))}
              {onEmailExhibitor && (
                <DropdownMenuItem onClick={onEmailExhibitor} className="min-h-11">
                  <Mail className="h-4 w-4" aria-hidden />
                  Email exhibitor…
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            All entries on this form
          </DropdownMenuLabel>
          <EnrollmentBulkStatusItems entries={entries} onBulkStatusChange={onBulkStatusChange} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
