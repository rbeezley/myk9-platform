import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';
import { CLUB_CREATE_DENIED_MESSAGE } from '@/pages/secretary/ShowCreationWizard/clubShowCreatePermission';

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
  createClubHref: string;
  /** MYK9-887: the signed-in user cannot create shows for the selected club. */
  clubCreateDenied?: boolean;
}

/* ------------------------------------------------------------------ */
/*  HostClubField — the host-club picker + inline "create club" form.  */
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
  createClubHref,
  clubCreateDenied = false,
}) => {
  const selectedClub = clubId ? clubs.find(c => c.id === clubId) : undefined;
  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="show-host-club">
        Host Club <span className="text-destructive">*</span>
      </Label>
      <div className="space-y-3">
        <SearchablePopover
          id="show-host-club"
          open={showSearch}
          onOpenChange={setShowSearch}
          triggerLabel={
            clubId ? clubs.find(c => c.id === clubId)?.name || 'Unknown Club' : 'Select a club'
          }
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
        {/* MYK9-889: choosing an existing club and creating a new one are different jobs.
            Once a club is chosen the create action steps back to a quiet text link. */}
        <p id="show-host-club-help" className="text-sm text-muted-foreground">
          {selectedClub
            ? `Hosting club: ${selectedClub.name}. It already exists, so there is nothing to create. Change it above if another club is hosting.`
            : 'Choose the club hosting this show from your clubs above. Only create a new club if yours is not listed.'}
        </p>
        {clubCreateDenied && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {CLUB_CREATE_DENIED_MESSAGE}
          </p>
        )}
        <Button
          asChild
          variant={selectedClub ? 'link' : 'outline'}
          className={selectedClub ? 'h-auto min-h-[44px] px-0 py-2 text-sm' : CREATE_BTN_CLASS}
        >
          <Link to={createClubHref}>
            <Plus className="mr-2 h-4 w-4" />
            {selectedClub
              ? 'My club is not listed: Create New Club'
              : 'Club not listed? Create New Club'}
          </Link>
        </Button>
      </div>
    </div>
  );
};
