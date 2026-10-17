import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClubNumberFields } from '@/components/clubs/ClubNumberFields';
import { useClubRegistryNumbers } from '@/hooks/queries/useClubRegistryNumbers';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { queryKeys } from '@/lib/queryClient';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import { saveClubRegistryNumbers } from '@/services/database/clubs';
import {
  CLUB_NUMBER_REQUIRED_MESSAGE,
  formatClubRegistryNumbers,
  hasClubRegistryNumber,
  normalizeClubRegistryNumbers,
  type ClubRegistryNumberInputs,
  type ClubRegistryNumbers,
} from '@/utils/clubRegistryNumbers';

interface ClubNumbersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
}

/** Fields start from the stored numbers; mounted only once they have loaded. */
const ClubNumbersForm: React.FC<{
  clubId: string;
  loaded: ClubRegistryNumbers;
  onDone: () => void;
}> = ({ clubId, loaded, onDone }) => {
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [values, setValues] = useState<ClubRegistryNumberInputs>({
    AKC: loaded.AKC ?? '',
    UKC: loaded.UKC ?? '',
    ASCA: loaded.ASCA ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // A club that has a number keeps at least one.
    if (hasClubRegistryNumber(loaded) && !hasClubRegistryNumber(values)) {
      setError(CLUB_NUMBER_REQUIRED_MESSAGE);
      return;
    }
    if (formatClubRegistryNumbers(values) === formatClubRegistryNumbers(loaded)) {
      onDone();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveClubRegistryNumbers(clubId, normalizeClubRegistryNumbers(values));
      await queryClient.invalidateQueries({ queryKey: queryKeys.clubRegistryNumbers(clubId) });
      notifications.success('Club numbers saved.');
      onDone();
    } catch (err) {
      logger.error('Failed to save club numbers', 'clubs', { clubId }, err as Error);
      setError("We couldn't save the club numbers. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ClubNumberFields
        values={values}
        idFor={org => `club-number-${org.toLowerCase()}`}
        onChange={(org, value) => {
          setValues(previous => ({ ...previous, [org]: value }));
          setError(null);
        }}
        error={error}
        disabled={saving}
      />
      {!isOnline && (
        <p className="text-sm text-muted-foreground" role="status">
          Club numbers need a connection.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={saving || !isOnline}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
};

export const ClubNumbersDialog: React.FC<ClubNumbersDialogProps> = ({
  open,
  onOpenChange,
  clubId,
}) => {
  const { data, isLoading, isError, refetch } = useClubRegistryNumbers(clubId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Club numbers</DialogTitle>
          <DialogDescription>
            Your club&apos;s ID from each registry. Leave a registry blank if the club has no number
            there.
          </DialogDescription>
        </DialogHeader>
        {/* Once numbers have loaded the form stays mounted, so a failed background
            refresh never discards what the user has typed (Codex review, MYK9-1235). */}
        {data ? (
          <>
            {isError && (
              <p className="text-sm text-muted-foreground" role="status">
                Couldn&apos;t refresh the club numbers. You can still save your changes.
              </p>
            )}
            <ClubNumbersForm clubId={clubId} loaded={data} onDone={() => onOpenChange(false)} />
          </>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading club numbers…
          </p>
        ) : (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t load the club numbers. Check your connection and try again.
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
