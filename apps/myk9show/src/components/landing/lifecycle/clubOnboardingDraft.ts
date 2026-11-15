import type { ClubRegistryNumberInputs } from '@/utils/clubRegistryNumbers';

// A visitor who is not signed in fills the club form, is sent to sign in, and
// comes back to the same form with what she typed. Session storage keeps it for
// this tab only and it is cleared the moment the club request is sent.

const KEY = 'myk9:club-onboarding-draft';

export interface ClubOnboardingDraft {
  clubName: string;
  organization: string;
  clubNumbers: ClubRegistryNumberInputs;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  firstShowDate: string;
  message: string;
}

export function saveClubOnboardingDraft(draft: ClubOnboardingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked; the visitor simply retypes the form.
  }
}

export function readClubOnboardingDraft(): ClubOnboardingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClubOnboardingDraft) : null;
  } catch {
    return null;
  }
}

export function clearClubOnboardingDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
