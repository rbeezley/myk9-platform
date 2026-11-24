import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClubNumberFields } from '@/components/clubs/ClubNumberFields';
import type { ClubNumbersDraft } from './useClubNumbersDraft';

/**
 * The club's registry numbers inside Edit Club. Numbers are online-only, so while they are
 * loading, failed to load, or the device is offline the fields are disabled with the reason
 * beside them, and the rest of the club still saves.
 */
export const ClubNumbersCard: React.FC<{ numbers: ClubNumbersDraft }> = ({ numbers }) => {
  const { status, values, editable, offline, refreshFailed, error } = numbers;
  if (status === 'off') return null;

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
      <CardContent className="space-y-3 pt-6">
        <ClubNumberFields
          values={values}
          idFor={org => `club-number-${org.toLowerCase()}`}
          onChange={numbers.setValue}
          error={error}
          disabled={!editable}
        />
        {status === 'loading' && (
          <p className="text-sm text-muted-foreground" role="status">
            Loading club numbers…
          </p>
        )}
        {(status === 'failed' || status === 'unavailable') && (
          <div className="flex flex-wrap items-center gap-3" role="status">
            <p className="text-sm text-muted-foreground">
              {status === 'failed'
                ? "We couldn't load the club numbers. The rest of the club can still be saved."
                : 'Club numbers need a connection to load. The rest of the club can still be saved.'}
            </p>
            <Button type="button" variant="outline" className="min-h-11" onClick={numbers.retry}>
              Try again
            </Button>
          </div>
        )}
        {numbers.dirty && (
          <Button type="button" variant="outline" className="min-h-11" onClick={numbers.reset}>
            Undo number changes
          </Button>
        )}
        {offline && (
          <p className="text-sm text-muted-foreground" role="status">
            Club numbers need a connection. The rest of the club can still be saved.
          </p>
        )}
        {refreshFailed && !offline && (
          <p className="text-sm text-muted-foreground" role="status">
            Couldn&apos;t refresh the club numbers. You can still save your changes.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
