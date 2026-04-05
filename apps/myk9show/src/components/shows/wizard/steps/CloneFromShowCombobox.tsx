/**
 * CloneFromShowCombobox — lightweight combobox at the top of step 1.
 *
 * Lists the secretary's past shows (filtered to their clubs). Selecting one
 * prefills all wizard form fields via updateShowData / addJudgeToShow so the
 * secretary can edit from a known baseline instead of starting from scratch.
 * Selecting "Start fresh" resets show data back to the wizard's empty defaults.
 */

import React, { useState, useMemo } from 'react';
import { Copy, ChevronsUpDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useWizardStore } from '@/store/wizardStore';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useUserStore } from '@/store/userStore';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import type { Show } from '@/types/show-types';

interface CloneFromShowComboboxProps {
  /** Optional: restrict to this clubId (pre-selected club context) */
  clubId?: string | undefined;
}

export const CloneFromShowCombobox: React.FC<CloneFromShowComboboxProps> = ({ clubId }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [clonedShowName, setClonedShowName] = useState<string | null>(null);

  const { updateShowData, addJudgeToShow } = useWizardStore();
  const { people } = useUserStore();
  const { data: allShows = [], isLoading } = useShowsQuery();

  // Determine which club IDs this user has secretary/admin access to
  const userClubIds = useUserClubIds();

  // Filter shows to the user's clubs (and optionally a specific clubId context)
  const candidateShows = useMemo(() => {
    return allShows
      .filter(s => {
        if (clubId && s.clubId !== clubId) return false;
        if (userClubIds && !userClubIds.has(s.clubId)) return false;
        return true;
      })
      .sort((a, b) => {
        // Most recent first
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        return db - da;
      });
  }, [allShows, clubId, userClubIds]);

  // Apply search filter
  const filteredShows = useMemo(() => {
    if (!search.trim()) return candidateShows;
    const term = search.toLowerCase();
    return candidateShows.filter(
      s =>
        s.name.toLowerCase().includes(term) ||
        s.location?.toLowerCase().includes(term) ||
        s.organization?.toLowerCase().includes(term)
    );
  }, [candidateShows, search]);

  const handleSelect = (show: Show) => {
    setOpen(false);
    setSearch('');
    setClonedShowName(show.name);

    // Prefill all non-date show fields
    updateShowData({
      name: show.name,
      organization: show.organization as 'AKC' | 'UKC' | 'Other',
      location: show.location || '',
      clubId: show.clubId || '',
      preEntryFee: parseFloat(show.preEntryFee) || 0,
      dayOfShowFee: parseFloat(show.dayOfShowFee || '0') || 0,
      startingArmbandNumber: show.startingArmbandNumber ?? 100,
      // Dates are intentionally left blank so the secretary fills them in
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
    });

    // Re-add judges from the source show
    if (show.assignedJudges?.length) {
      for (const assignment of show.assignedJudges) {
        const person = people.find(p => p.id === assignment.judgeId);
        addJudgeToShow(assignment.judgeId, {
          name: person
            ? `${person.firstName} ${person.lastName}`
            : assignment.judgeName || 'Unknown Judge',
          email: person?.email || '',
          phone: person?.phone || '',
          certifications: person?.judgeQualifications?.map(q => q.organization) || [],
          notes: '',
        });
      }
    }
  };

  const handleStartFresh = () => {
    setClonedShowName(null);
    updateShowData({
      name: '',
      organization: 'AKC',
      startDate: '',
      endDate: '',
      location: '',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      startingArmbandNumber: 100,
      judgeIds: [],
    });
  };

  if (candidateShows.length === 0 && !isLoading) {
    // No past shows to clone from — render nothing so the form looks clean for new users
    return null;
  }

  return (
    <div className="group relative bg-gradient-to-br from-primary/5 to-primary/3 border border-primary/20 rounded-2xl p-5 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:border-primary/30">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Copy className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-1">Clone from a previous show</p>
          <p className="text-xs text-muted-foreground mb-3">
            Prefill this form from an existing show — dates are always left blank for you to set
            fresh.
          </p>

          {clonedShowName ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[240px]">{clonedShowName}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleStartFresh}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground px-2"
              >
                <X className="h-3.5 w-3.5" />
                Start fresh
              </Button>
            </div>
          ) : (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 bg-background/60 border-border hover:bg-background/80 text-sm"
                  aria-expanded={open}
                >
                  Select a past show to clone
                  <ChevronsUpDown className="h-4 w-4 opacity-50 ml-auto" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b">
                  <Input
                    placeholder="Search shows..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {isLoading && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      Loading shows...
                    </div>
                  )}
                  {!isLoading && filteredShows.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No matching shows found.
                    </div>
                  )}
                  {filteredShows.map(show => (
                    <button
                      key={show.id}
                      type="button"
                      onClick={() => handleSelect(show)}
                      className="w-full px-3 py-2.5 text-left hover:bg-accent hover:text-accent-foreground transition-colors duration-150 flex flex-col gap-0.5"
                    >
                      <span className="text-sm font-medium leading-tight truncate">
                        {show.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {show.organization}
                        {show.startDate
                          ? ` · ${format(new Date(show.startDate), 'MMM d, yyyy')}`
                          : ''}
                        {show.location ? ` · ${show.location.split('\n')[0].split(',')[0]}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {/* Subtle note that dates are excluded */}
      {clonedShowName && (
        <p className="text-xs text-muted-foreground mt-3 pl-11">
          Show dates and entry period dates were left blank — fill them in below.
        </p>
      )}
    </div>
  );
};

export default CloneFromShowCombobox;
