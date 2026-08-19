import type { RoleRequest } from '@/services/database/role-requests';

export const roleLabels: Record<RoleRequest['requestedRole'], string> = {
  club_admin: 'Club admin',
  secretary: 'Show secretary',
};

export const getRoleLabel = (role: RoleRequest['requestedRole']) => roleLabels[role];
