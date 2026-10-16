import { useRegistrationNumberNeededEmail } from '@/features/lifecycle-emails';
import { RegistrationNeededTab } from './RegistrationNeededTab';
import type { RegistrationNeededRow } from './management/registrationNeeded';
import type { EntryManagementEntry } from '@/types/entry-management-types';

interface RegistrationNeededPaneProps {
  showId: string;
  showName?: string | undefined;
  rows: readonly RegistrationNeededRow[];
  loading: boolean;
  unknown: boolean;
  onRetry?: (() => void) | undefined;
  onOpenEntry: (entry: EntryManagementEntry) => void;
}

/**
 * The "Registration number needed" list with its email reminder (MYK9-1162).
 * Owns the lifecycle-email hook so it mounts only while this pane is showing.
 */
export function RegistrationNeededPane({
  showId,
  showName,
  rows,
  loading,
  unknown,
  onRetry,
  onOpenEntry,
}: RegistrationNeededPaneProps) {
  const emails = useRegistrationNumberNeededEmail({ showId, showName });

  return (
    <>
      <RegistrationNeededTab
        rows={rows}
        loading={loading}
        unknown={unknown}
        onRetry={onRetry}
        onOpenEntry={onOpenEntry}
        onEmailExhibitor={
          emails.stepEnabled
            ? ({ entry, registryId }) => emails.openEmail({ entry, registryId })
            : undefined
        }
        hasEmailed={emails.hasEmailed}
      />
      {emails.dialog}
    </>
  );
}
