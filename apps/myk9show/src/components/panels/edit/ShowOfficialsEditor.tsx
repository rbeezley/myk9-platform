import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { OfficialPicker } from '@/components/shows/wizard/steps/OfficialPicker';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/services/database/supabaseClient';
import { createUser } from '@/services/database/users';
import { UserRole } from '@/types/auth-types';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

interface ShowOfficialsEditorProps {
  showId: string;
}

export function ShowOfficialsEditor({ showId }: ShowOfficialsEditorProps) {
  const queryClient = useQueryClient();
  const { data: officials, isLoading } = useShowOfficials(showId);
  const { people, loadPeople } = useUserStore();
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  useEffect(() => {
    if (people.length === 0) loadPeople();
  }, [people.length, loadPeople]);

  const handleAssign = async (role: UserRole, personId: string) => {
    setPendingRole(role);
    try {
      const { error } = await supabase.rpc('grant_show_official', {
        p_person_id: personId,
        p_role_name: role,
        p_show_id: showId,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
      notifications.success('Official assigned');
    } catch (err) {
      logger.warn('Failed to grant official role', 'officials-editor', {
        error: err instanceof Error ? err.message : String(err),
      });
      notifications.error(
        `Failed to assign role: ${err instanceof Error ? err.message : String(err)}`
      );
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assignments save automatically the moment you pick a person — you don&apos;t need to click
        Save Changes for officials. To replace someone already assigned, contact a site admin.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OfficialPicker
          label="Show Chairman"
          required
          selectedPersonId={currentChairman}
          people={people}
          suggestedRoles={[UserRole.CHAIRMAN, UserRole.CLUB_ADMIN]}
          onSelect={id => handleAssign(UserRole.CHAIRMAN, id)}
          onCreatePerson={handleCreatePerson}
        />
        <OfficialPicker
          label="Show Secretary"
          required
          selectedPersonId={currentSecretary}
          people={people}
          suggestedRoles={[UserRole.SECRETARY]}
          onSelect={id => handleAssign(UserRole.SECRETARY, id)}
          onCreatePerson={handleCreatePerson}
        />
        <OfficialPicker
          label="Steward"
          selectedPersonId={currentSteward}
          people={people}
          suggestedRoles={[UserRole.STEWARD]}
          onSelect={id => handleAssign(UserRole.STEWARD, id)}
          onCreatePerson={handleCreatePerson}
        />
      </div>

      {pendingRole && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving {pendingRole}…
        </div>
      )}
    </div>
  );
}
