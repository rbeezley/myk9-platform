/**
 * ClubContextGate — what a club-scoped admin page renders when it has no single
 * club to act on.
 *
 * MYK9-138. Both club-admin pages inlined the same three-branch ternary and both
 * fell through to "We could not verify your club access yet. Check your
 * connection and try again." for any status the ternary did not name. The copy
 * now lives in clubContextMessages.ts, and multiple clubs get a switcher instead
 * of an error.
 */

import React from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  describeClubContext,
  type UnresolvedClubContext,
} from '@/components/club-admin/clubContextMessages';

interface ClubContextGateProps {
  context: UnresolvedClubContext;
  /** Noun used in the copy, e.g. "members" or "payments". */
  surface: string;
  onRetry: () => void;
  onSelectClub: (clubId: string) => void;
}

export const ClubContextGate: React.FC<ClubContextGateProps> = ({
  context,
  surface,
  onRetry,
  onSelectClub,
}) => {
  if (context.status === 'choose') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="bg-gradient-to-br from-card to-card/80 border-border/50 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="max-w-md text-muted-foreground">
              Choose which club&apos;s {surface} you want to manage.
            </p>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {context.clubs.map(club => (
                <Button
                  key={club.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onSelectClub(club.id)}
                >
                  {club.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { icon: Icon, message, canRetry } = describeClubContext(context, surface);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="bg-gradient-to-br from-card to-card/80 border-border/50 backdrop-blur-xl">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-md text-muted-foreground">{message}</p>
          {canRetry && <Button onClick={onRetry}>Try again</Button>}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClubContextGate;
