import type { UserRole as UserRoleType } from '@/types/user-types';

export const ROLE_OPTIONS = [
  { value: 'exhibitor' as UserRoleType, label: 'Exhibitor' },
  { value: 'handler' as UserRoleType, label: 'Handler' },
  { value: 'judge' as UserRoleType, label: 'Judge' },
  { value: 'secretary' as UserRoleType, label: 'Secretary' },
  { value: 'steward' as UserRoleType, label: 'Steward' },
  { value: 'admin' as UserRoleType, label: 'Admin' },
] as const;
