import React from 'react';
import { RequiredMark } from '@/components/common/RequiredMark';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';
import { FieldError, useFieldError } from '@/components/forms';
import { SHOW_FIELD } from '@/pages/secretary/ShowCreationWizard/wizardFieldIds';
import { clubCreateDeniedMessage } from '@/pages/secretary/ShowCreationWizard/clubShowCreatePermission';
import {
  ADD_YOUR_CLUB_PATH,
  ADD_YOUR_CLUB_PROMPT,
} from '@/components/landing/lifecycle/landingCtas';

const CREATE_BTN_CLASS = 'w-full border-primary/20 text-primary hover:bg-primary/5';

interface HostClubFieldProps {
  clubId: string | undefined;
  clubs: Club[];
  filteredClubs: Club[];
  showSearch: boolean;
  setShowSearch: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelectClub: (clubId: string) => void;
  /** MYK9-887: the signed-in user cannot create shows for the selected club. */
  clubCreateDenied?: boolean;
}

/* ------------------------------------------------------------------ */
/*  HostClubField — the host-club picker + the link to ask for a club. */
/*  Lives *inside* the Basics group (no heading of its own): host club */
/*  is show identity, not an official.                                 */
/* ------------------------------------------------------------------ */

export const HostClubField: React.FC<HostClubFieldProps> = ({
  clubId,
  clubs,
  filteredClubs,
  showSearch,
  setShowSearch,
  searchTerm,
  setSearchTerm,
  onSelectClub,
  clubCreateDenied = false,
}) => {
  const selectedClub = clubId ? clubs.find(c => c.id === clubId) : undefined;
  const clubError = useFieldError(SHOW_FIELD.hostClub);
  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="show-host-club">
        Host Club
        <RequiredMark />
      </Label>
      <div className="space-y-3">
        <SearchablePopover
          id={SHOW_FIELD.hostClub}
          aria-invalid={clubError.controlProps['aria-invalid']}
          open={showSearch}
          onOpenChange={setShowSearch}
          triggerLabel={
            clubId ? clubs.find(c => c.id === clubId)?.name || 'Unknown Club' : 'Select a club'
          }
          aria-describedby={[
            clubError.controlProps['aria-describedby'],
            'show-host-club-help',
            clubCreateDenied ? 'show-host-club-advisory' : undefined,
          ]
            .filter(Boolean)
            .join(' ')}
          searchPlaceholder="Search clubs..."
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          items={filteredClubs}
          emptyMessage="No clubs found"
          listboxLabel="Clubs"
          selectedItemIds={clubId ? [clubId] : []}
          onSelect={club => {
            onSelectClub(club.id);
            setSearchTerm('');
          }}
          renderItem={club => (
            <div className="p-3 hover:bg-muted border-b last:border-b-0">
              <div className="font-medium">{club.name}</div>
              <div className="text-sm text-muted-foreground">
                {club.address.city}, {club.address.state}
              </div>
            </div>
          )}
        />
        <FieldError field={SHOW_FIELD.hostClub} />
        {/* MYK9-889: choosing an existing club and adding a new one are different jobs.
            Once a club is chosen the add action steps back to a quiet text link.
            MYK9-2048: adding a club goes through the one form on the home page. */}
        <p id="show-host-club-help" className="text-sm text-muted-foreground">
          {selectedClub
            ? `Hosting club: ${selectedClub.name}. It already exists, so there is nothing to create. Change it above if another club is hosting.`
            : 'Choose the club hosting this show above. Only create a new club if yours is not listed.'}
        </p>
        {clubCreateDenied && (
          <p
            id="show-host-club-advisory"
            role="status"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
          >
            {clubCreateDeniedMessage(selectedClub?.name ?? 'this club')}
          </p>
        )}
        <Button
          asChild
          variant={selectedClub ? 'link' : 'outline'}
          className={selectedClub ? 'h-auto min-h-[44px] px-0 py-2 text-sm' : CREATE_BTN_CLASS}
        >
          <Link to={ADD_YOUR_CLUB_PATH}>
            <Plus className="mr-2 h-4 w-4" />
            {ADD_YOUR_CLUB_PROMPT}
          </Link>
        </Button>
      </div>
    </div>
  );
};
