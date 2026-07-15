import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';

export interface EntryManagementHrefInput {
  showId: string;
  trialId?: string | null;
  classId?: string | null;
  attention?: 'all' | 'pending' | 'missing_information' | 'accepted' | 'waitlist' | 'issues';
  payment?:
    'all' | 'pending' | 'paid_online' | 'paid_by_check' | 'paid_by_cash' | 'waived' | 'refunded';
  mode?: 'review' | 'day-of';
}

export function getEntryManagementHref(input: EntryManagementHrefInput): string {
  const params = new URLSearchParams();
  if (input.mode) params.set('mode', input.mode);
  if (input.attention && input.attention !== 'all') params.set('attention', input.attention);
  if (input.payment && input.payment !== 'all') params.set('payment', input.payment);
  if (input.trialId) params.set('trial', input.trialId);
  if (input.classId) params.set('class', input.classId);
  const query = params.toString();
  return `/shows/${encodeURIComponent(input.showId)}/entry-management${query ? `?${query}` : ''}`;
}

export function getClassReviewHref(input: {
  showId: string;
  trialId?: string | null;
  classId: string;
}): string {
  return getEntryManagementHref({ ...input, attention: 'pending', mode: 'review' });
}

export function getClassMissingInformationHref(input: {
  showId: string;
  trialId?: string | null;
  classId: string;
}): string {
  return getEntryManagementHref({ ...input, attention: 'missing_information', mode: 'review' });
}

export function getClassPaymentDueHref(input: {
  showId: string;
  trialId?: string | null;
  classId: string;
}): string {
  return getEntryManagementHref({
    ...input,
    attention: 'accepted',
    payment: 'pending',
    mode: 'review',
  });
}

export function getClassDayOfHref(input: {
  showId: string;
  trialId?: string | null;
  classId: string;
}): string {
  return getEntryManagementHref({ ...input, attention: 'accepted', mode: 'day-of' });
}

export function getClassScoringHref(classId: string): string {
  return getPaperScoringClassHref(classId);
}
