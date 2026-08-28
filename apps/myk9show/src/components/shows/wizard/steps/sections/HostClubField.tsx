import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';

const CREATE_BTN_CLASS = 'w-full border-primary/20 text-primary hover:bg-primary/5';

export interface CreateClubData {
  name: string;
  email: string;
}

interface HostClubFieldProps {
  clubId: string | undefined;
  clubs: Club[];
  filteredClubs: Club[];
  showSearch: boolean;
  setShowSearch: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelectClub: (clubId: string) => void;
  onCreateClub: (data: CreateClubData) => Promise<void>;
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
  onCreateClub,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [clubName, setClubName] = useState('');
  const [clubEmail, setClubEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canSave = clubName.trim() !== '' && clubEmail.trim() !== '';

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setClubName('');
    setClubEmail('');
    setSaveError(null);
  };

  const handleSaveCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onCreateClub({ name: clubName.trim(), email: clubEmail.trim() });
      handleCancelCreate();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="show-host-club">
        Host Club <span className="text-destructive">*</span>
      </Label>
      <div className="space-y-3">
        {!showCreateForm && (
          <>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateForm(true)}
              className={CREATE_BTN_CLASS}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Club
            </Button>
          </>
        )}

        {showCreateForm && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-semibold">New Club</p>
            <div className="space-y-1">
              <Label htmlFor="new-club-name" className="text-xs">
                Club name *
              </Label>
              <Input
                id="new-club-name"
                placeholder="Club name"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-club-email" className="text-xs">
                Email *
              </Label>
              <Input
                id="new-club-email"
                placeholder="club@example.com"
                type="email"
                value={clubEmail}
                onChange={e => setClubEmail(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelCreate}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSave || saving}
                onClick={handleSaveCreate}
                className="w-full sm:w-auto"
              >
                Add Club
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
