/**
 * ClubSwitcher — change which club a club-admin page is acting on.
 *
 * MYK9-138. Without this, choosing a club is a ONE-WAY DOOR: the context
 * resolves to `ready` and the chooser never renders again, so an operator with
 * more than one club — which every site admin now is — had to reload the app to
 * manage a different one.
 *
 * Renders nothing for a single club: there is no choice to present, and a
 * disabled control would only add noise for ordinary single-club admins.
 */

import React from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClubSummary } from '@/hooks/useValidatedClubContext';

interface ClubSwitcherProps {
  clubs: ClubSummary[];
  selectedClubId: string;
  onSelectClub: (clubId: string) => void;
}

export const ClubSwitcher: React.FC<ClubSwitcherProps> = ({
  clubs,
  selectedClubId,
  onSelectClub,
}) => {
  if (clubs.length <= 1) return null;

  const current = clubs.find(club => club.id === selectedClubId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          <span className="max-w-[16rem] truncate">{current?.name ?? 'Choose a club'}</span>
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {clubs.map(club => (
          <DropdownMenuItem key={club.id} onClick={() => onSelectClub(club.id)}>
            <span className="flex-1 truncate">{club.name}</span>
            {club.id === selectedClubId && (
              <Check className="ml-2 h-4 w-4" aria-hidden="true" data-testid="selected-club" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ClubSwitcher;
