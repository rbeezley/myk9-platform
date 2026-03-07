import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, X, GraduationCap } from 'lucide-react';
import type { User } from '@/types/user-types';
import type { Club } from '@/types/club-types';
import type { ResolvedJudge } from './ShowDetailsStep.types';

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
/*  SearchablePopover — reusable popover with search input + list     */
/* ------------------------------------------------------------------ */

interface SearchablePopoverProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
}

function SearchablePopover<T extends { id: string }>({
  open,
  onOpenChange,
  triggerLabel,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  items,
  renderItem,
  emptyMessage,
}: SearchablePopoverProps<T>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {triggerLabel}
          <Search className="ml-auto h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-auto">
          {items.map(item => (
            <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
          ))}
          {items.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">{emptyMessage}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

/* ------------------------------------------------------------------ */
/*  OfficialPicker — chairman or secretary                             */
/* ------------------------------------------------------------------ */

interface OfficialPickerProps {
  label: string;
  selectedId: string | undefined;
  selectedName: string | undefined;
  filteredPeople: User[];
  showSearch: boolean;
  setShowSearch: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelect: (personId: string) => void;
  onCreate: () => void;
}

const OfficialPicker: React.FC<OfficialPickerProps> = ({
  label,
  selectedName,
  filteredPeople,
  showSearch,
  setShowSearch,
  searchTerm,
  setSearchTerm,
  onSelect,
  onCreate,
}) => (
  <div className="space-y-2">
    <Label>
      {label} <span className="text-destructive">*</span>
    </Label>
    <div className="space-y-3">
      <SearchablePopover
        open={showSearch}
        onOpenChange={setShowSearch}
        triggerLabel={selectedName || `Select ${label.toLowerCase()}`}
        searchPlaceholder="Search people..."
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        items={filteredPeople}
        emptyMessage="No people found"
        renderItem={person => (
          <div
            className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
            onClick={() => {
              onSelect(person.id);
              setShowSearch(false);
              setSearchTerm('');
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {person.firstName} {person.lastName}
              </span>
              {person.roles && person.roles.length > 0 && (
                <div className="flex gap-1">
                  {person.roles.map(role => (
                    <Badge key={role} variant="outline" className="text-[10px] px-1.5 py-0">
                      {role}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {person.email && <div className="text-sm text-muted-foreground">{person.email}</div>}
          </div>
        )}
      />
      <Button type="button" variant="outline" onClick={onCreate} className={CREATE_BTN_CLASS}>
        <Plus className="mr-2 h-4 w-4" />
        Create New {label}
      </Button>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  OfficialsSection                                                    */
/* ------------------------------------------------------------------ */

interface OfficialsSectionProps {
  chairmanName: string | undefined;
  secretaryName: string | undefined;
  filteredChairmen: User[];
  filteredSecretaries: User[];
  showChairmanSearch: boolean;
  setShowChairmanSearch: (open: boolean) => void;
  chairmanSearchTerm: string;
  setChairmanSearchTerm: (term: string) => void;
  showSecretarySearch: boolean;
  setShowSecretarySearch: (open: boolean) => void;
  secretarySearchTerm: string;
  setSecretarySearchTerm: (term: string) => void;
  onSelectChairman: (id: string) => void;
  onSelectSecretary: (id: string) => void;
  onCreateChairman: () => void;
  onCreateSecretary: () => void;
}

export const OfficialsSection: React.FC<OfficialsSectionProps> = ({
  chairmanName,
  secretaryName,
  filteredChairmen,
  filteredSecretaries,
  showChairmanSearch,
  setShowChairmanSearch,
  chairmanSearchTerm,
  setChairmanSearchTerm,
  showSecretarySearch,
  setShowSecretarySearch,
  secretarySearchTerm,
  setSecretarySearchTerm,
  onSelectChairman,
  onSelectSecretary,
  onCreateChairman,
  onCreateSecretary,
}) => (
  <div className={CARD_CLASS}>
    <div className={OVERLAY_CLASS} />
    <div className="relative">
      <h3 className={HEADING_CLASS}>Show Officials</h3>
      <div className="grid grid-cols-2 gap-4">
        <OfficialPicker
          label="Show Chairman"
          selectedId={undefined}
          selectedName={chairmanName}
          filteredPeople={filteredChairmen}
          showSearch={showChairmanSearch}
          setShowSearch={setShowChairmanSearch}
          searchTerm={chairmanSearchTerm}
          setSearchTerm={setChairmanSearchTerm}
          onSelect={onSelectChairman}
          onCreate={onCreateChairman}
        />
        <OfficialPicker
          label="Show Secretary"
          selectedId={undefined}
          selectedName={secretaryName}
          filteredPeople={filteredSecretaries}
          showSearch={showSecretarySearch}
          setShowSearch={setShowSecretarySearch}
          searchTerm={secretarySearchTerm}
          setSearchTerm={setSecretarySearchTerm}
          onSelect={onSelectSecretary}
          onCreate={onCreateSecretary}
        />
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  JudgesSection                                                       */
/* ------------------------------------------------------------------ */

interface JudgesSectionProps {
  selectedJudges: ResolvedJudge[];
  availableJudges: User[];
  showSearch: boolean;
  setShowSearch: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  hasAnyJudges: boolean;
  onAddJudge: (person: User) => void;
  onRemoveJudge: (id: string) => void;
  onCreateJudge: () => void;
}

export const JudgesSection: React.FC<JudgesSectionProps> = ({
  selectedJudges,
  availableJudges,
  showSearch,
  setShowSearch,
  searchTerm,
  setSearchTerm,
  hasAnyJudges,
  onAddJudge,
  onRemoveJudge,
  onCreateJudge,
}) => (
  <div className={CARD_CLASS}>
    <div className={OVERLAY_CLASS} />
    <div className="relative">
      <h3 className={HEADING_CLASS}>
        <span className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Show Judges
        </span>
      </h3>
      <div className="space-y-4">
        {/* Selected Judges */}
        {selectedJudges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedJudges.map(judge => (
              <Badge
                key={judge.id}
                variant="secondary"
                className="flex items-center gap-1.5 py-1.5 px-3 text-sm"
              >
                <span>{judge.name}</span>
                {judge.judgeNumber && (
                  <span className="text-muted-foreground">#{judge.judgeNumber}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveJudge(judge.id)}
                  className="ml-1 hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Judge Search Popover */}
        <SearchablePopover
          open={showSearch}
          onOpenChange={setShowSearch}
          triggerLabel={
            selectedJudges.length > 0
              ? `${selectedJudges.length} judge${selectedJudges.length !== 1 ? 's' : ''} selected — add more`
              : 'Search and add judges'
          }
          searchPlaceholder="Search by name or judge number..."
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          items={availableJudges}
          emptyMessage={hasAnyJudges ? 'No more judges available' : 'No judges found in the system'}
          renderItem={judge => (
            <div
              className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
              onClick={() => onAddJudge(judge)}
            >
              <div className="font-medium">
                {judge.firstName} {judge.lastName}
              </div>
              <div className="text-sm text-muted-foreground">
                {judge.judgeInfo?.judgeNumber
                  ? `#${judge.judgeInfo.judgeNumber}`
                  : 'No judge number'}
              </div>
            </div>
          )}
        />

        {/* Create New Judge */}
        <Button
          type="button"
          variant="outline"
          onClick={onCreateJudge}
          className={CREATE_BTN_CLASS}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create New Judge
        </Button>

        <p className="text-xs text-muted-foreground">
          Judges added here will be available for class assignment in the next steps.
        </p>
      </div>
    </div>
  </div>
);
