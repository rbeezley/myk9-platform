import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';

/* ------------------------------------------------------------------ */
/*  Shared card wrapper used by every section                         */
/* ------------------------------------------------------------------ */

const CARD_CLASS =
  'group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5';
const OVERLAY_CLASS =
  'absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500';
const HEADING_CLASS =
  'text-lg font-semibold mb-4 pl-3 border-l-2 border-primary text-primary transition-colors duration-300';
const CREATE_BTN_CLASS =
  'w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm';

/* ------------------------------------------------------------------ */
/*  ClubSection                                                        */
/* ------------------------------------------------------------------ */

interface ClubSectionProps {
  clubId: string | undefined;
  clubs: Club[];
  filteredClubs: Club[];
  showSearch: boolean;
  setShowSearch: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelectClub: (clubId: string) => void;
  onCreateClub: () => void;
}

export const ClubSection: React.FC<ClubSectionProps> = ({
  clubId,
  clubs,
  filteredClubs,
  showSearch,
  setShowSearch,
  searchTerm,
  setSearchTerm,
  onSelectClub,
  onCreateClub,
}) => (
  <div className={CARD_CLASS}>
    <div className={OVERLAY_CLASS} />
    <div className="relative">
      <h3 className={HEADING_CLASS}>Club Information</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>
            Host Club <span className="text-destructive">*</span>
          </Label>
          <div className="space-y-3">
            <SearchablePopover
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
                  className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                  onClick={() => {
                    onSelectClub(club.id);
                    setShowSearch(false);
                    setSearchTerm('');
                  }}
                >
                  <div className="font-medium">{club.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {club.address.city}, {club.address.state}
                  </div>
                </div>
              )}
            />
            <Button
              type="button"
              variant="outline"
              onClick={onCreateClub}
              className={CREATE_BTN_CLASS}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Club
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
