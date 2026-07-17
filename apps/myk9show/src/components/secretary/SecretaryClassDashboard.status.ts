import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';

export type SecretaryDashboardClassStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export function normalizeSecretaryDashboardClassStatus(
  status: string | null | undefined
): SecretaryDashboardClassStatus {
  switch (normalizeClassStatus(status ?? '')) {
    case CLASS_STATUS.IN_PROGRESS:
      return 'in-progress';
    case CLASS_STATUS.COMPLETED:
      return 'completed';
    case CLASS_STATUS.CANCELLED:
      return 'cancelled';
    default:
      return 'pending';
  }
}
