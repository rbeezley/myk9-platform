/**
 * Which tone a registration status badge takes (MYK9-1210).
 *
 * Stored casing depends on the entry path: the form writes "Active"/"Pending",
 * while the dog-create RPC and offline placeholders write lowercase "pending".
 * They are the same states, so the badge compares case-insensitively and never
 * rewrites the stored value.
 */
export type RegistrationStatusTone = 'positive' | 'attention' | 'neutral';

export function registrationStatusTone(status: string): RegistrationStatusTone {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'positive';
  if (normalized === 'pending' || normalized === 'under review') return 'attention';
  return 'neutral';
}
