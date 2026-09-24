/**
 * CloneFromShowCombobox — lightweight combobox at the top of step 1.
 *
 * Lists the secretary's past shows (filtered to their clubs). Picking one starts a clone
 * (useCloneFromShow), which prefills the wizard once every source class has loaded. This
 * component only picks: the clone's status and its recovery actions (cancel, retry, choose
 * another, start fresh) live in CloneStatusBanner, which does not depend on this list query.
 */

import React, { useState, useMemo } from 'react';
import { Copy, ChevronsUpDown } from 'lucide-react';
import { formatShortCalendarDate } from '@/lib/format/dates';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useWizardStore } from '@/store/wizardStore';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import { useUserClubIds } from '@/hooks/useUserClubIds';
import type { Show } from '@/types/show-types';
import { useCloneFromShow } from './useCloneFromShow';

interface CloneFromShowComboboxProps {
  /** Optional: restrict to this clubId (pre-selected club context) */
  clubId?: string | undefined;
}

export const CloneFromShowCombobox: React.FC<CloneFromShowComboboxProps> = ({ clubId }) => {
  const { cloneHydration } = useWizardStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: allShows = [], isLoading, isError } = useShowsQuery();
  const startClone = useCloneFromShow();

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
    void startClone(show);
  };

  // A clone is loading, failed or applied: CloneStatusBanner owns the UI until it is dismissed.
  if (cloneHydration.status !== 'idle') return null;

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">We could not load previous shows.</p>
        <p>You can still enter this show manually.</p>
      </div>
    );
  }

  if (candidateShows.length === 0 && !isLoading) {
    // No past shows to clone from — render nothing so the form looks clean for new users
    return null;
  }

  return (
    <div className="relative bg-primary/5 border border-primary/20 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Copy className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-1">Clone from a previous show</p>
          <p className="text-xs text-muted-foreground mb-3">
            Prefill this form from an existing show. Dates are always left blank for you to set
            fresh.
          </p>

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
                    <span className="text-sm font-medium leading-tight truncate">{show.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {show.organization}
                      {show.startDate ? ` · ${formatShortCalendarDate(show.startDate)}` : ''}
                      {show.location ? ` · ${show.location.split('\n')[0].split(',')[0]}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default CloneFromShowCombobox;
