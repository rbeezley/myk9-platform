import { useAuth } from './useAuth';

/**
 * Hook to get the current authenticated user
 * @returns The current user object or null if not authenticated
 */
export function useAuthUser() {
  const { user } = useAuth();
  return user;
}

export default useAuthUser;