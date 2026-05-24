import React from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Club } from '@/types/club-types';
import { MemberList } from '../members/MemberList';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { useUserStore } from '@/store/userStore';
import { notifications } from '@/lib/notifications';
import {
  clubSecretaryService,
  type ClubSecretaryAssignment,
} from '@/features/club-secretaries/clubSecretaryService';

interface MembersTabProps {
  club: Club;
  canManageMembers: boolean;
  onAddMember: () => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  club,
  canManageMembers,
  onAddMember,
}) => {
  const memberCount = club.memberIds?.length || 0;
  const people = useUserStore(state => state.people);
  const [secretaryPersonId, setSecretaryPersonId] = React.useState('');
  const [secretaries, setSecretaries] = React.useState<ClubSecretaryAssignment[]>([]);
  const [secretaryRoleIds, setSecretaryRoleIds] = React.useState<string[]>([]);
  const [isLoadingSecretaries, setIsLoadingSecretaries] = React.useState(false);
  const [isMutatingSecretary, setIsMutatingSecretary] = React.useState(false);

  const loadSecretaries = React.useCallback(async () => {
    if (!canManageMembers) return;

    setIsLoadingSecretaries(true);
    try {
      const roleIds =
        secretaryRoleIds.length > 0
          ? secretaryRoleIds
          : await clubSecretaryService.listSecretaryRoleIds();
      setSecretaryRoleIds(roleIds);
      setSecretaries(await clubSecretaryService.listSecretaries(club.id, roleIds));
    } catch {
      notifications.error('Failed to load show secretaries');
    } finally {
      setIsLoadingSecretaries(false);
    }
  }, [canManageMembers, club.id, secretaryRoleIds]);

  React.useEffect(() => {
    void loadSecretaries();
  }, [loadSecretaries]);

  const activeSecretaryIds = React.useMemo(
    () => new Set(secretaries.map(assignment => assignment.user_id)),
    [secretaries]
  );

  const availableSecretaryPeople = people.filter(person => !activeSecretaryIds.has(person.id));

  const handleAddSecretary = async () => {
    if (!secretaryPersonId) return;

    setIsMutatingSecretary(true);
    try {
      await clubSecretaryService.grantSecretary({
        personId: secretaryPersonId,
        clubId: club.id,
      });
      const addedPerson = people.find(person => person.id === secretaryPersonId);
      notifications.success(
        `${addedPerson ? `${addedPerson.firstName} ${addedPerson.lastName}` : 'Secretary'} added`
      );
      setSecretaryPersonId('');
      await loadSecretaries();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : 'Failed to add secretary');
    } finally {
      setIsMutatingSecretary(false);
    }
  };

  const handleRevokeSecretary = async (personId: string) => {
    setIsMutatingSecretary(true);
    try {
      await clubSecretaryService.revokeSecretary({ personId, clubId: club.id });
      notifications.success('Secretary access removed');
      await loadSecretaries();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : 'Failed to remove secretary');
    } finally {
      setIsMutatingSecretary(false);
    }
  };

  const secretarySection = canManageMembers ? (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Show Secretaries</h3>
        <p className="text-sm text-muted-foreground">
          Secretaries added here can manage shows for this club only.
        </p>
      </div>
      <FormField label="Select Secretary" fieldId="secretary-person-select">
        <Select value={secretaryPersonId} onValueChange={setSecretaryPersonId}>
          <SelectTrigger id="secretary-person-select">
            <SelectValue placeholder="Choose a person" />
          </SelectTrigger>
          <SelectContent>
            {availableSecretaryPeople.map(person => (
              <SelectItem key={person.id} value={person.id}>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {person.firstName} {person.lastName}
                  </span>
                  {person.email && (
                    <span className="text-xs text-muted-foreground">{person.email}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={secretaryPersonId === '' || isMutatingSecretary}
          onClick={() => void handleAddSecretary()}
        >
          Add Secretary
        </Button>
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        {isLoadingSecretaries ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading secretaries...
          </div>
        ) : secretaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No show secretaries added yet.</p>
        ) : (
          secretaries.map(assignment => (
            <div
              key={assignment.id}
              className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {assignment.people?.first_name} {assignment.people?.last_name}
                </p>
                {assignment.people?.email && (
                  <p className="text-xs text-muted-foreground">{assignment.people.email}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isMutatingSecretary}
                onClick={() => void handleRevokeSecretary(assignment.user_id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  if (memberCount === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
          <div className="text-lg font-medium mb-2 text-foreground">No Members Yet</div>
          <div className="text-sm text-muted-foreground leading-relaxed mb-5">
            This club doesn't have any members yet.{' '}
            {canManageMembers
              ? 'Add your first member to get started.'
              : 'Only club admins can add members.'}
          </div>
          {canManageMembers && (
            <Button onClick={onAddMember} className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add First Member
            </Button>
          )}
        </div>
        {secretarySection}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Club Members</h3>
          {canManageMembers && (
            <Button onClick={onAddMember} className="min-h-[44px]">
              <Plus className="w-5 h-5 mr-2" />
              Add Member
            </Button>
          )}
        </div>
        <MemberList club={club} canManageMembers={canManageMembers} />
      </div>
      {secretarySection}
    </div>
  );
};
