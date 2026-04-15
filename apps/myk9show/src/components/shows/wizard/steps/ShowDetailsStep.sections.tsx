import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export interface CreateClubData {
  name: string;
  email: string;
}

interface ClubSectionProps {
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
              {!showCreateForm && (
                <>
                  <SearchablePopover
                    open={showSearch}
                    onOpenChange={setShowSearch}
                    triggerLabel={
                      clubId
                        ? clubs.find(c => c.id === clubId)?.name || 'Unknown Club'
                        : 'Select a club'
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
                    <Label className="text-xs">Club name *</Label>
                    <Input
                      placeholder="Club name"
                      value={clubName}
                      onChange={e => setClubName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      placeholder="club@example.com"
                      type="email"
                      value={clubEmail}
                      onChange={e => setClubEmail(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  {saveError && <p className="text-xs text-destructive">{saveError}</p>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleCancelCreate}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSave || saving}
                      onClick={handleSaveCreate}
                    >
                      Add Club
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
