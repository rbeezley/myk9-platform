import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';

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
}) => {
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
          renderItem={club => (
            <div
              role="button"
              tabIndex={0}
              aria-label={`Select ${club.name}`}
              className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => {
                onSelectClub(club.id);
                setShowSearch(false);
                setSearchTerm('');
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectClub(club.id);
                  setShowSearch(false);
                  setSearchTerm('');
                }
              }}
            >
              <div className="font-medium">{club.name}</div>
              <div className="text-sm text-muted-foreground">
                {club.address.city}, {club.address.state}
              </div>
            </div>
          )}
        />
        <Button asChild variant="outline" className={CREATE_BTN_CLASS}>
          <Link to={createClubHref}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Club
          </Link>
        </Button>
      </div>
    </div>
  );
};
