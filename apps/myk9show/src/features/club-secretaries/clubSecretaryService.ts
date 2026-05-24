import { supabase } from '@/lib/supabase';

interface SecretaryMutationInput {
  personId: string;
  clubId: string;
}

export interface ClubSecretaryAssignment {
  id: string;
  user_id: string;
  club_id: string;
  people: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

function throwIfError(error: unknown): asserts error is null {
  if (error) {
    const message = error instanceof Error ? error.message : 'Secretary access operation failed';
    throw new Error(message);
  }
}

export const clubSecretaryService = {
  async listSecretaryRoleIds(): Promise<string[]> {
    const { data, error } = await supabase.from('roles').select('id').in('name', ['secretary']);

    throwIfError(error);
    return (data ?? []).map(role => role.id);
  },

  async listSecretaries(
    clubId: string,
    secretaryRoleIds: string[]
  ): Promise<ClubSecretaryAssignment[]> {
    const { data, error } = await supabase
      .from('user_roles')
      .select(
        'id, user_id, club_id, people!user_roles_user_id_fkey(id, first_name, last_name, email)'
      )
      .eq('club_id', clubId)
      .eq('is_active', true)
      .in('role_id', secretaryRoleIds);

    throwIfError(error);
    return (data ?? []) as unknown as ClubSecretaryAssignment[];
  },

  async grantSecretary(input: SecretaryMutationInput): Promise<string | null> {
    const { data, error } = await supabase.rpc('grant_club_secretary', {
      p_person_id: input.personId,
      p_club_id: input.clubId,
    });

    throwIfError(error);
    return data;
  },

  async revokeSecretary(input: SecretaryMutationInput): Promise<void> {
    const { error } = await supabase.rpc('revoke_club_secretary', {
      p_person_id: input.personId,
      p_club_id: input.clubId,
    });

    throwIfError(error);
  },
};
