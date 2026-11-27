import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { ShowCommitteeEditor } from '@/components/committee/ShowCommitteeEditor';
import { OfficialPicker } from '@/components/shows/wizard/steps/OfficialPicker';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/services/database/supabaseClient';
import { createUser } from '@/services/database/users';
import { UserRole } from '@/types/auth-types';
import { notifications } from '@/lib/notifications';
import { OfficialMailingAddressField } from './OfficialMailingAddressField';
import { replaceShowOfficial } from './replaceShowOfficial';
import { logger } from '@/services/LoggingService';

interface ShowOfficialsEditorProps {
  showId: string;
}

/** What the last pick for one role did, shown under that role's picker (MYK9-2470). */
interface PickOutcome {
  saved: boolean;
  text: string;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  [UserRole.CHAIRMAN]: 'Chair',
  [UserRole.SECRETARY]: 'Secretary',
  [UserRole.STEWARD]: 'Steward',
};

/**
 * The line under a picker. A pick saves at once and the panel's Save Changes stays disabled, so
 * without this the change looked unsaved: the answer has to be where she was looking.
 */
function PickOutcomeNote({ outcome }: { outcome: PickOutcome | undefined }) {
  if (!outcome) return null;
  return (
    <p
      role="status"
      className={`mt-1 flex items-start gap-1 text-xs ${outcome.saved ? 'text-success' : 'text-destructive'}`}
    >
      {outcome.saved && <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{outcome.text}</span>
    </p>
  );
}

export function ShowOfficialsEditor({ showId }: ShowOfficialsEditorProps) {
  const queryClient = useQueryClient();
  const { data: officials, isLoading } = useShowOfficials(showId);
  const { people, loadPeople, loadUsers } = useUserStore();
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<UserRole, PickOutcome>>>({});
  // "Add new" selects a person the moment she is created, before `people` has her: keep the
  // name she typed so the saved note can still say who it is.
  const createdNames = useRef(new Map<string, string>());

  useEffect(() => {
    if (people.length === 0) loadPeople();
  }, [people.length, loadPeople]);

  const handleAssign = async (role: UserRole, personId: string) => {
    const singleHolderRole =
      role === UserRole.CHAIRMAN ? 'chairman' : role === UserRole.SECRETARY ? 'secretary' : null;
    const roleLabel = ROLE_LABELS[role] ?? 'official';
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
    const picked = people.find(person => person.id === personId);
    const pickedName = picked
      ? `${picked.firstName} ${picked.lastName}`.trim()
      : (createdNames.current.get(personId) ?? 'The new person');
    const report = (outcome: PickOutcome) => setOutcomes(prev => ({ ...prev, [role]: outcome }));
    // Says who holds the role now, on the toast and under the picker she just used (MYK9-2470).
    const reportSaved = () => {
      const text = `${pickedName} is now ${roleLabel}.`;
      notifications.success(text);
      report({ saved: true, text: `Saved. ${text}` });
    };

    setPendingRole(role);
    setOutcomes(prev => ({ ...prev, [role]: undefined }));
    try {
      if (!singleHolderRole) {
        // Stewards keep grant-only behavior: a steward row also grants ring access.
        const { error } = await supabase.rpc('grant_show_official', {
          p_person_id: personId,
          p_role_name: role,
          p_show_id: showId,
        });
        if (error) throw error;
        await invalidate();
        reportSaved();
        return;
      }

      try {
        const { stillListed, revokeError } = await replaceShowOfficial({
          showId,
          role: singleHolderRole,
          personId,
        });
        if (stillListed.length === 0) {
          reportSaved();
          return;
        }
        const names = stillListed.map(h => `${h.firstName} ${h.lastName}`.trim()).join(', ');
        logger.warn('Failed to revoke previous official', 'officials-editor', {
          error: revokeError,
        });
        const partial = `${pickedName} is now ${roleLabel}, but ${names} ${stillListed.length === 1 ? 'is' : 'are'} still listed. Try again.`;
        notifications.error(partial);
        report({ saved: false, text: partial });
      } finally {
        // Refetch on every outcome so a half-finished replace shows the true state.
        await invalidate();
      }
    } catch (err) {
      // A PostgrestError is a plain object, not an Error: read its message too.
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      logger.warn('Failed to grant official role', 'officials-editor', { error: message });
      notifications.error(`Failed to assign role: ${message}`);
      report({ saved: false, text: `${roleLabel} was not changed. Try again.` });
    } finally {
      setPendingRole(null);
    }
  };

  const handleCreatePerson = async (data: {
    firstName: string;
    lastName: string;
    email: string;
  }): Promise<string> => {
    const result = await createUser({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
    });
    if (result.error) throw result.error;
    createdNames.current.set(result.data!.id, `${data.firstName} ${data.lastName}`.trim());
    await loadPeople();
    return result.data!.id;
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading officials…
      </div>
    );
  }

  const currentChairman = officials?.chairmen[0]?.personId;
  const currentSecretary = officials?.secretaries[0]?.personId;
  const currentSteward = officials?.stewards[0]?.personId;
  const chairman = officials?.chairmen[0];
  const secretary = officials?.secretaries[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assignments save automatically the moment you pick a person — you don&apos;t need to click
        Save Changes for officials. Picking a new Chair or Secretary replaces the current one.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <OfficialPicker
            label="Chair"
            required
            selectedPersonId={currentChairman}
            people={people}
            suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
            onOpen={() => void loadUsers()}
            onSelect={id => handleAssign(UserRole.CHAIRMAN, id)}
            onCreatePerson={handleCreatePerson}
          />
          <PickOutcomeNote outcome={outcomes[UserRole.CHAIRMAN]} />
        </div>
        <div>
          <OfficialPicker
            label="Secretary"
            required
            selectedPersonId={currentSecretary}
            people={people}
            suggestedRoles={[UserRole.SECRETARY]}
            onOpen={() => void loadUsers()}
            onSelect={id => handleAssign(UserRole.SECRETARY, id)}
            onCreatePerson={handleCreatePerson}
          />
          <PickOutcomeNote outcome={outcomes[UserRole.SECRETARY]} />
        </div>
        <div>
          <OfficialPicker
            label="Steward"
            selectedPersonId={currentSteward}
            people={people}
            suggestedRoles={[UserRole.STEWARD]}
            onOpen={() => void loadUsers()}
            onSelect={id => handleAssign(UserRole.STEWARD, id)}
            onCreatePerson={handleCreatePerson}
          />
          <PickOutcomeNote outcome={outcomes[UserRole.STEWARD]} />
        </div>
      </div>

      {(chairman || secretary) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chairman && (
            <OfficialMailingAddressField
              key={`chairman-${chairman.personId}`}
              showId={showId}
              personId={chairman.personId}
              role="chairman"
              roleLabel="Chair"
              savedAddress={chairman.mailingAddress ?? null}
            />
          )}
          {secretary && (
            <OfficialMailingAddressField
              key={`secretary-${secretary.personId}`}
              showId={showId}
              personId={secretary.personId}
              role="secretary"
              roleLabel="Secretary"
              savedAddress={secretary.mailingAddress ?? null}
            />
          )}
        </div>
      )}

      <ShowCommitteeEditor showId={showId} people={people} />

      {pendingRole && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving {pendingRole}…
        </div>
      )}
    </div>
  );
}
