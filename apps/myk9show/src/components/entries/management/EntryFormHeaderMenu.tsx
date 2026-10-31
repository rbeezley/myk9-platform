import { Mail, MoreHorizontal, StickyNote } from 'lucide-react';
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
  /** Present only when the form has an enrollment row to note against. */
  onAddNote?: (() => void) | undefined;
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
  onAddNote,
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
        {(onEmailExhibitor || onAddNote) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {exhibitorName}
              </DropdownMenuLabel>
              {onEmailExhibitor && (
                <DropdownMenuItem onClick={onEmailExhibitor}>
                  <Mail className="h-4 w-4" aria-hidden />
                  Email exhibitor…
                </DropdownMenuItem>
              )}
              {onAddNote && (
                <DropdownMenuItem onClick={onAddNote}>
                  <StickyNote className="h-4 w-4" aria-hidden />
                  Add private note…
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
