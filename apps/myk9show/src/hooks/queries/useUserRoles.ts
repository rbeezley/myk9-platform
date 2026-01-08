import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/types/auth-types';

// Raw data structure from Supabase (with joined role data)
// interface SupabaseUserRoleData {
//   id: string;
//   user_id: string;
//   is_active: boolean;
//   assigned_at: string;
//   role: {
//     id: string;
//     name: string;
//     display_name: string;
//     description: string;
//     is_active: boolean;
//   };
// }


/**
 * Hook to fetch user roles from the proper RBAC system
 * This replaces the simple array-based roles with proper database relationships
 */
export function useUserRoles(userId?: string) {
  return useQuery({
    queryKey: ['userRoles', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // First look up the people.id from auth_user_id
      const { data: personData, error: personError } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', userId)
        .single();

      if (personError || !personData) {
        console.log('No people record found for auth user:', userId);
        return [];
      }

      const peopleId = personData.id;

      // Now get user roles using people.id
      const { data: userRoleData, error: userRoleError } = await supabase
        .from('user_roles')
        .select('id, user_id, role_id, granted_at')
        .eq('user_id', peopleId);

      if (userRoleError) {
        console.error('useUserRoles user_role query error:', userRoleError);
        throw userRoleError;
      }

      if (!userRoleData || userRoleData.length === 0) {
        console.log('No user roles found for user:', userId);
        return [];
      }

      // Get role details for each role_id
      const roleIds = userRoleData.map(ur => ur.role_id).filter((id): id is string => id !== null);
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, name, description')
        .in('id', roleIds);

      if (roleError) {
        console.error('useUserRoles role query error:', roleError);
        throw roleError;
      }

      const data = userRoleData.map(userRole => {
        const role = roleData?.find(r => r.id === userRole.role_id);
        return {
          ...userRole,
          user_id: userRole.user_id || '', // Transform null to empty string
          granted_at: userRole.granted_at || '', // Transform null to empty string
          role
        };
      }).filter(item => item.role); // Only include items where we found the role

      console.log('🔍 Raw user roles data:', data);

      // Process the data
      if (!data || !Array.isArray(data)) {
        console.warn('No user roles data returned');
        return [];
      }

      return data
        .filter(item => item.role)
        .map(item => ({
          id: item.id,
          user_id: item.user_id,
          granted_at: item.granted_at,
          role: item.role
        }));
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime)
  });
}

/**
 * Hook to get user roles as simple array (for backwards compatibility)
 */
export function useUserRoleNames(userId?: string): UserRole[] {
  const { data: userRoles, error } = useUserRoles(userId);
  
  console.log('🔍 useUserRoleNames debug:', { userId: userId?.substring(0, 8) + '...', userRoles, error });
  
  if (!userRoles) {
    return [];
  }

  const roleNames = (userRoles as Array<{role: {name: string}}>)
    .filter((ur) => ur.role)
    .map((ur) => ur.role.name as UserRole);
  
  console.log('🔍 Extracted role names:', roleNames);
  return roleNames;
}

/**
 * Hook to check if user has specific role
 */
export function useHasRole(userId?: string, role?: UserRole): boolean {
  const roles = useUserRoleNames(userId);
  return role ? roles.includes(role) : false;
}

/**
 * Hook to get all users with their roles (for admin use)
 */
export function useAllUsersWithRoles() {
  return useQuery({
    queryKey: ['allUsersWithRoles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles_view')
        .select('*')
        .order('email');

      if (error) {
        throw error;
      }

      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes (renamed from cacheTime)
  });
}