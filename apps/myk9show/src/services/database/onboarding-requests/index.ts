// Authoritative data access module for Onboarding Requests
// (clubs requesting to onboard onto the myK9 platform).
// All callers import from here — never from supabaseClient directly.

export type { OnboardingRequest, CreateOnboardingRequest } from './types';

export { getMyOnboardingRequests, getAllOnboardingRequests } from './reads';

export { submitOnboardingRequest, updateOnboardingRequest } from './writes';
