import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { SearchablePopover } from '@/components/ui/searchable-popover';
import { Plus } from 'lucide-react';
import type { Club } from '@/types/club-types';
import type { ShowDraft } from '@/store/wizardStore';
import { ORGANIZATIONS } from './ShowDetailsStep.types';
import { FeeField } from './ShowDetailsStep.FeeField';
import {
  getPremiumStyleOptions,
  resolvePremiumStyle,
  type PremiumStyle,
} from '@/types/premium-types';

/* ------------------------------------------------------------------ */
/*  Shared card wrapper used by every section                         */
/* ------------------------------------------------------------------ */

// Flat section wrappers — no gradient/glow/blur card chrome and no side-stripe
// headings (DESIGN.md: flat by default, never nested, no colored side-stripes).
const CARD_CLASS = '';
const OVERLAY_CLASS = 'hidden';
const HEADING_CLASS = 'text-lg font-semibold mb-4 text-foreground';
const CREATE_BTN_CLASS = 'w-full border-primary/20 text-primary hover:bg-primary/5';

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  BasicShowInfoSection                                               */
/* ------------------------------------------------------------------ */

const PREMIUM_STYLE_OPTIONS = getPremiumStyleOptions();
const PREMIUM_STYLE_LABEL_BY_VALUE: Record<PremiumStyle, string> = PREMIUM_STYLE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<PremiumStyle, string>
);

function getPremiumStyleLabel(style: PremiumStyle | undefined): string {
  return PREMIUM_STYLE_LABEL_BY_VALUE[resolvePremiumStyle(style)];
}

interface BasicShowInfoSectionProps {
  show: ShowDraft;
  dateRangeValid: boolean;
  entryDatesValid: boolean;
  onUpdate: (patch: Partial<ShowDraft>) => void;
}

export const BasicShowInfoSection: React.FC<BasicShowInfoSectionProps> = ({
  show,
  dateRangeValid,
  entryDatesValid,
  onUpdate,
}) => {
  return (
    <div>
      <div>
        <h3 className="text-lg font-semibold mb-4 text-foreground">Basic Show Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="show-name">
              Show Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="show-name"
              value={show.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="Enter show name"
              className="border border-border bg-input rounded-md"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-organization">
              Organization <span className="text-destructive">*</span>
            </Label>
            <Select
              value={show.organization || ''}
              onValueChange={value => onUpdate({ organization: value })}
            >
              <SelectTrigger id="show-organization" className="bg-input h-10">
                <SelectValue placeholder="Select organization">
                  {show.organization
                    ? ORGANIZATIONS.find(t => t.value === show.organization)?.label
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATIONS.map(org => (
                  <SelectItem key={org.value} value={org.value}>
                    {org.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="show-dates">
              Show Dates <span className="text-destructive">*</span>
            </Label>
            <DateRangePicker
              id="show-dates"
              startDate={show.startDate ? new Date(show.startDate) : undefined}
              endDate={show.endDate ? new Date(show.endDate) : undefined}
              onStartDateChange={date => onUpdate({ startDate: date?.toISOString() || '' })}
              onEndDateChange={date => onUpdate({ endDate: date?.toISOString() || '' })}
              startLabel="Start"
              endLabel="End"
              placeholder="Select show start and end dates"
              startDefaultTime="8:00 AM"
              endDefaultTime="5:00 PM"
            />
            {!dateRangeValid && (
              <p className="text-sm text-destructive mt-1">Start date must be before end date</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="show-entry-period">
              Entry Period <span className="text-destructive">*</span>
            </Label>
            <DateRangePicker
              id="show-entry-period"
              startDate={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
              endDate={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
              onStartDateChange={date => onUpdate({ entryOpenDate: date?.toISOString() || '' })}
              onEndDateChange={date => onUpdate({ entryCloseDate: date?.toISOString() || '' })}
              startLabel="Opens"
              endLabel="Closes"
              placeholder="Select entry open and close dates"
              startDefaultTime="8:00 AM"
              endDefaultTime="11:59 PM"
            />
            {!entryDatesValid && (
              <p className="text-sm text-destructive mt-1">
                Entry open date must be before close date
              </p>
            )}
          </div>

          <FeeField
            id="show-pre-entry-fee"
            label="Pre-Entry Fee"
            tooltip="Entry fee for registrations submitted before the entry close date. Usually lower than day-of-show fee."
            value={show.preEntryFee}
            onChange={v => {
              if (v !== undefined) onUpdate({ preEntryFee: v });
            }}
          />

          <FeeField
            id="show-day-of-show-fee"
            label="Day-of-Show Fee"
            tooltip="Entry fee for on-site registrations on the day of the show. Usually higher than pre-entry fee."
            value={show.dayOfShowFee}
            onChange={v => {
              if (v !== undefined) onUpdate({ dayOfShowFee: v });
            }}
          />

          <div className="space-y-2">
            <Label htmlFor="show-premium-style">Premium List Style</Label>
            <Select
              value={resolvePremiumStyle(show.style)}
              onValueChange={value => onUpdate({ style: value as PremiumStyle })}
            >
              <SelectTrigger id="show-premium-style" className="bg-input h-10">
                <SelectValue placeholder="Select style">
                  {getPremiumStyleLabel(show.style)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PREMIUM_STYLE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-starting-armband" className="flex items-center gap-1.5">
              Starting Armband Number
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>
                      First dog registered will receive this armband number. Subsequent dogs get
                      sequential numbers.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="show-starting-armband"
              type="number"
              min={1}
              value={show.startingArmbandNumber ?? 100}
              onChange={e =>
                onUpdate({
                  startingArmbandNumber: parseInt(e.target.value, 10) || 100,
                })
              }
              className="border border-border bg-input rounded-md"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="show-location">
              Location <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="show-location"
              value={show.location || ''}
              onChange={e => onUpdate({ location: e.target.value })}
              placeholder="Enter venue name and address"
              rows={3}
              className="border border-border bg-input rounded-md"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
