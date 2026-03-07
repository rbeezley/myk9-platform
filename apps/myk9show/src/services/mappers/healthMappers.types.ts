// Validation constants and type guards for health record mappers

export const HEALTH_RECORD_TYPES = [
  'vaccination',
  'medication',
  'allergy',
  'vet_visit',
  'general',
] as const;
export type HealthRecordType = (typeof HEALTH_RECORD_TYPES)[number];

export function isHealthRecordType(value: string): value is HealthRecordType {
  return (HEALTH_RECORD_TYPES as readonly string[]).includes(value);
}

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'life_threatening'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export function isAllergySeverity(value: string): value is AllergySeverity {
  return (ALLERGY_SEVERITIES as readonly string[]).includes(value);
}

export const OFA_TEST_TYPES = ['hips', 'elbows', 'eyes', 'heart', 'patella', 'thyroid'] as const;
export type OFATestType = (typeof OFA_TEST_TYPES)[number];

export function isOFATestType(value: string): value is OFATestType {
  return (OFA_TEST_TYPES as readonly string[]).includes(value);
}

export const OFA_STATUSES = ['normal', 'carrier', 'affected', 'pending'] as const;
export type OFAStatus = (typeof OFA_STATUSES)[number];

export function isOFAStatus(value: string): value is OFAStatus {
  return (OFA_STATUSES as readonly string[]).includes(value);
}
