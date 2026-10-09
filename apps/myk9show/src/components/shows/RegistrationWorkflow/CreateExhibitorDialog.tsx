import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** The show whose add-entry flow this is; recorded as `created_from_show_id` (MYK9-1059). */
  createdFromShowId?: string | undefined;
}

/** The possible-duplicate card: announced, focused and scrolled into view when it appears. */
const DuplicateNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      data-testid="person-duplicate-notice"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </div>
  );
};

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
  createdFromShowId,
}) => {
  const { people, loadUsers } = useUserStore();
  // The candidates and the "add anyway" answer belong to ONE identity (name and
  // email). Changing either re-opens the question, so a changed person is re-checked.
  const [duplicates, setDuplicates] = useState<{
    candidates: PersonIdentityCandidate[];
    key: string;
  }>({ candidates: [], key: '' });
  const [allowedKey, setAllowedKey] = useState<string | null>(null);
  const [identityKey, setIdentityKey] = useState('');

  // Loaded once the dialog opens: the duplicate check reads the whole roster.
  React.useEffect(() => {
    if (open && people.length === 0) loadUsers();
  }, [loadUsers, open, people.length]);

  const initialUserData = useMemo(() => nameFromSearch(searchQuery), [searchQuery]);

  const handleClose = () => {
    setDuplicates({ candidates: [], key: '' });
    setAllowedKey(null);
    setIdentityKey('');
    onOpenChange(false);
  };

  const keyOf = (data: Partial<PersonRecord>) =>
    [data.firstName, data.lastName, data.email]
      .map(part => (part ?? '').trim().toLowerCase())
      .join('|');

  const handleDataChange = useCallback((data: Partial<PersonRecord>) => {
    setIdentityKey(
      [data.firstName, data.lastName, data.email]
        .map(part => (part ?? '').trim().toLowerCase())
        .join('|')
    );
  }, []);

  /** True when the person looks like someone already on file and has not been waved through. */
  const holdForDuplicate = (data: Partial<PersonRecord>): boolean => {
    const key = keyOf(data);
    if (allowedKey === key) return false;
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
    if (!candidate) {
      setDuplicates({ candidates: [], key });
      return false;
    }
    setDuplicates({ candidates: [candidate], key });
    return true;
  };

  const handleSave = async (data: Partial<PersonRecord>) => {
    // The card above the tabs explains this; the panel keeps the form open
    // without a failure toast.
    if (holdForDuplicate(data)) throw new PanelSaveHandledError();
    setDuplicates({ candidates: [], key: '' });

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
        ...(createdFromShowId && { createdFromShowId }),
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
      ...(createdFromShowId && { created_from_show_id: createdFromShowId }),
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

  const shown = duplicates.key === identityKey ? duplicates.candidates : [];
  const notice =
    shown.length > 0 ? (
      <DuplicateNotice>
        <CreateExhibitorDuplicates
          duplicates={shown}
          onSelect={candidate => {
            onDuplicateSelected?.(candidate.person);
            handleClose();
          }}
          onAddAnyway={() => {
            setAllowedKey(identityKey);
            setDuplicates({ candidates: [], key: '' });
          }}
        />
      </DuplicateNotice>
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
      onDataChange={handleDataChange}
      onBeforeNext={data => !holdForDuplicate(data)}
    />
  );
};
