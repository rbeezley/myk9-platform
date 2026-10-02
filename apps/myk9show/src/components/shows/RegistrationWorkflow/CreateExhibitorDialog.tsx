import React, { useMemo, useState } from 'react';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { PanelSaveHandledError } from '@/components/panels/edit/panelSaveErrors';
import { CreateExhibitorDuplicates } from './CreateExhibitorDuplicates';
import { User } from '@/types/dog-types';
import type { User as PersonRecord } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';
import { createUser } from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import { logger } from '@/services/LoggingService';
import { useUserStore } from '@/store/userStore';
import {
  findLikelyDuplicatePersonCandidate,
  type PersonIdentityCandidate,
} from '@/utils/personIdentity';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';

interface CreateExhibitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExhibitorCreated: (
    exhibitor: User,
    metadata?: { pendingMutationIds?: string[] | undefined }
  ) => void;
  onDuplicateSelected?: (existingExhibitor: User) => void;
  searchQuery?: string; // Pre-fill from search if provided
  offlineFirst?: boolean;
}

/** Pre-fill the name from what the secretary searched for. */
function nameFromSearch(searchQuery: string): Partial<PersonRecord> {
  const trimmed = searchQuery.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(' ');
  return parts.length >= 2
    ? { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
    : { lastName: trimmed };
}

/**
 * The entry flow's Add Person. There is ONE Person create form (MYK9-931,
 * decision 3): this is the same `UserEditPanel` the People page opens, shown as a
 * dialog, with the entry flow's two extras layered on: a possible-duplicate check
 * before the save, and offline-first persistence through the show-desk queue.
 * Email is optional (mail-in entrants have none, MYK9-832).
 */
export const CreateExhibitorDialog: React.FC<CreateExhibitorDialogProps> = ({
  open,
  onOpenChange,
  onExhibitorCreated,
  onDuplicateSelected,
  searchQuery = '',
  offlineFirst = false,
}) => {
  const { people, loadUsers } = useUserStore();
  const [duplicates, setDuplicates] = useState<PersonIdentityCandidate[]>([]);
  const [allowSeparate, setAllowSeparate] = useState(false);

  // Loaded once the dialog opens: the duplicate check reads the whole roster.
  React.useEffect(() => {
    if (open && people.length === 0) loadUsers();
  }, [loadUsers, open, people.length]);

  const initialUserData = useMemo(() => nameFromSearch(searchQuery), [searchQuery]);

  const handleClose = () => {
    setDuplicates([]);
    setAllowSeparate(false);
    onOpenChange(false);
  };

  const handleSave = async (data: Partial<PersonRecord>) => {
    if (!allowSeparate) {
      const candidate = findLikelyDuplicatePersonCandidate(people, {
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        streetAddress: data.address ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        zipCode: data.zipCode ?? '',
      });
      if (candidate) {
        setDuplicates([candidate]);
        // The card above the tabs explains this; the panel keeps the form open
        // without a failure toast.
        throw new PanelSaveHandledError();
      }
    }
    setDuplicates([]);

    if (offlineFirst) {
      const person = await replicatedShowDeskPeopleTable.createPerson({
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
      });

      const newExhibitor: User = {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email ?? '',
        phone: person.phone ?? '',
        streetAddress: person.address ?? undefined,
        city: person.city ?? undefined,
        state: person.state ?? undefined,
        zipCode: person.zipCode ?? undefined,
        roles: [UserRole.EXHIBITOR],
        dogs: [],
        associatedDogs: [],
      };
      const pendingMutationIds = await replicatedShowDeskPeopleTable.getPendingMutationIdsForRow(
        person.id
      );
      onExhibitorCreated(newExhibitor, { pendingMutationIds });
      return;
    }

    const { data: row, error } = await createUser({
      first_name: data.firstName ?? '',
      last_name: data.lastName ?? '',
      email: data.email || null,
      phone: data.phone || null,
      street_address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      zip_code: data.zipCode || null,
    });
    if (error || !row) {
      // The original error, not a copy: its SQLSTATE is what tells a duplicate
      // email from an outage. The panel turns it into friendly copy.
      logger.error('Error creating exhibitor:', 'shows', {}, (error ?? undefined) as Error);
      throw error ?? new Error('Unable to add person.');
    }
    onExhibitorCreated({
      ...mapDatabaseToUser(row as Record<string, unknown>),
      roles: [UserRole.EXHIBITOR],
      dogs: [],
      associatedDogs: [],
    });
  };

  const notice =
    duplicates.length > 0 ? (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
        <CreateExhibitorDuplicates
          duplicates={duplicates}
          onSelect={candidate => {
            onDuplicateSelected?.(candidate.person);
            handleClose();
          }}
          onAddAnyway={() => {
            setAllowSeparate(true);
            setDuplicates([]);
          }}
        />
      </div>
    ) : null;

  return (
    <UserEditPanel
      open={open}
      onClose={handleClose}
      userId=""
      userName="New Person"
      initialUserData={initialUserData}
      onSave={handleSave}
      variant="dialog"
      notice={notice}
    />
  );
};
