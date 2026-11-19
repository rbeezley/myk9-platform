import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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

export function ShowOfficialsEditor({ showId }: ShowOfficialsEditorProps) {
  const queryClient = useQueryClient();
  const { data: officials, isLoading } = useShowOfficials(showId);
  const { people, loadPeople, loadUsers } = useUserStore();
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  useEffect(() => {
    if (people.length === 0) loadPeople();
  }, [people.length, loadPeople]);

  const handleAssign = async (role: UserRole, personId: string) => {
    const singleHolderRole =
      role === UserRole.CHAIRMAN ? 'chairman' : role === UserRole.SECRETARY ? 'secretary' : null;
    const roleLabel = role === UserRole.CHAIRMAN ? 'Chair' : 'Secretary';
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });

    setPendingRole(role);
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
        notifications.success('Official assigned');
        return;
      }

      try {
        const { stillListed, revokeError } = await replaceShowOfficial({
          showId,
          role: singleHolderRole,
          personId,
        });
        if (stillListed.length === 0) {
          notifications.success('Official assigned');
          return;
        }
        const newPerson = people.find(person => person.id === personId);
        const newName = newPerson
          ? `${newPerson.firstName} ${newPerson.lastName}`.trim()
          : 'The new person';
        const names = stillListed.map(h => `${h.firstName} ${h.lastName}`.trim()).join(', ');
        logger.warn('Failed to revoke previous official', 'officials-editor', {
          error: revokeError,
        });
        notifications.error(
          `${newName} is now ${roleLabel}, but ${names} ${stillListed.length === 1 ? 'is' : 'are'} still listed. Try again.`
        );
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
        <OfficialPicker
          label="Steward"
          selectedPersonId={currentSteward}
          people={people}
          suggestedRoles={[UserRole.STEWARD]}
          onOpen={() => void loadUsers()}
          onSelect={id => handleAssign(UserRole.STEWARD, id)}
          onCreatePerson={handleCreatePerson}
        />
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
