import { UserRole } from '@/types/auth-types';

/** Who `/people` and `/people/:id` admit. Links to a person's record show only to these roles. */
export const PEOPLE_ROUTE_ROLES = [UserRole.SECRETARY, UserRole.SITE_ADMIN];
