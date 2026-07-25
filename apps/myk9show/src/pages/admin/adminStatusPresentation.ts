import type { PayoutStatus } from '@/features/payments/payoutLedger';
import type { RoleRequestStatus } from '@/services/database/role-requests';
import type { OnboardingRequest } from '@/services/database/onboarding-requests';

type OnboardingStatus = OnboardingRequest['status'];

type AdminStatusTone = 'pending' | 'progress' | 'success' | 'danger';

export interface AdminStatusPresentation {
  label: string;
  className: string;
}

const ADMIN_STATUS_CLASSES: Record<AdminStatusTone, string> = {
  pending: 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/10',
  progress: 'border-info/30 bg-info/10 text-info hover:bg-info/10',
  success: 'border-success/30 bg-success/10 text-success hover:bg-success/10',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10',
};

export const ROLE_REQUEST_STATUS_FILTERS: readonly (RoleRequestStatus | 'all')[] = [
  'all',
  'pending',
  'approved',
  'denied',
];

const ROLE_REQUEST_STATUS: Record<RoleRequestStatus, { label: string; tone: AdminStatusTone }> = {
  pending: { label: 'Pending', tone: 'pending' },
  approved: { label: 'Approved', tone: 'success' },
  denied: { label: 'Denied', tone: 'danger' },
};

export const ONBOARDING_STATUS_FILTERS: readonly (OnboardingStatus | 'all')[] = [
  'all',
  'pending',
  'contacted',
  'onboarded',
  'declined',
];

const ONBOARDING_STATUS: Record<OnboardingStatus, { label: string; tone: AdminStatusTone }> = {
  pending: { label: 'Pending', tone: 'pending' },
  contacted: { label: 'Contacted', tone: 'progress' },
  onboarded: { label: 'Onboarded', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
};

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: AdminStatusTone }> = {
  pending: { label: 'Pending', tone: 'pending' },
  processing: { label: 'Processing', tone: 'progress' },
  completed: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

function toPresentation(config: { label: string; tone: AdminStatusTone }): AdminStatusPresentation {
  return {
    label: config.label,
    className: ADMIN_STATUS_CLASSES[config.tone],
  };
}

export function getRoleRequestStatusPresentation(
  status: RoleRequestStatus
): AdminStatusPresentation {
  return toPresentation(ROLE_REQUEST_STATUS[status]);
}

export function getRoleRequestFilterLabel(status: RoleRequestStatus | 'all'): string {
  return status === 'all' ? 'All' : ROLE_REQUEST_STATUS[status].label;
}

export function getOnboardingStatusPresentation(status: OnboardingStatus): AdminStatusPresentation {
  return toPresentation(ONBOARDING_STATUS[status]);
}

export function getOnboardingFilterLabel(status: OnboardingStatus | 'all'): string {
  return status === 'all' ? 'All' : ONBOARDING_STATUS[status].label;
}

/**
 * Payout statuses are money-transfer states, not entry lifecycle states. Keep
 * them on the shared admin tone vocabulary instead of the entry classifier.
 */
export function getPayoutStatusPresentation(status: PayoutStatus): AdminStatusPresentation {
  return toPresentation(PAYOUT_STATUS[status]);
}
