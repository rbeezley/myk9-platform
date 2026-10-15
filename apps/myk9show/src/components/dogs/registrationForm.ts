/**
 * The one registration form's schema, shapes and mappers (MYK9-1117).
 *
 * Every host of the form validates against `registrationFormSchema`, whether it
 * writes an in-memory `Registration` for an unsaved dog (Add Dog) or saves to
 * the database (Dog Details and the entry wizard).
 */
import { z } from 'zod';
import { Registration, REGISTRATION_STATUS_VALUES } from '@/types/dog-types';

const ORG_CODE_MAP: Record<string, string> = {
  'AKC (American Kennel Club)': 'AKC',
  'UKC (United Kennel Club)': 'UKC',
  // ASCA trials need an ASCA number (MYK9-1162); ASCA has no breed list of its
  // own here, so the breed picker falls back to the AKC list.
  'ASCA (Australian Shepherd Club of America)': 'ASCA',
  'CKC (Canadian Kennel Club)': 'CKC',
  'FCI (Fédération Cynologique Internationale)': 'FCI',
  'KC (The Kennel Club UK)': 'KC',
  'ILP (Indefinite Listing Privilege)': 'AKC', // ILP is an AKC program
  'PAL (Purebred Alternative Listing)': 'AKC', // PAL is an AKC program
  'Mixed Breed': 'AKC',
  Other: 'Other',
};

export const REGISTRATION_ORGS = [
  'AKC (American Kennel Club)',
  'UKC (United Kennel Club)',
  'ASCA (Australian Shepherd Club of America)',
  'CKC (Canadian Kennel Club)',
  'FCI (Fédération Cynologique Internationale)',
  'KC (The Kennel Club UK)',
  'ILP (Indefinite Listing Privilege)',
  'PAL (Purebred Alternative Listing)',
  'Mixed Breed',
  'Other',
];

/** The breed-list code for a registration organization: its full label or a stored short code. */
export function registrationOrgCode(organization: string): string {
  return (
    ORG_CODE_MAP[organization] ||
    (Object.values(ORG_CODE_MAP).includes(organization) ? organization : 'AKC')
  );
}

/** Letters, numbers, hyphens and slashes: the one shape a registration number may take. */
export const REGISTRATION_NUMBER_PATTERN = /^[A-Za-z0-9\-/]+$/;

export const registrationFormSchema = z.object({
  id: z.string().max(64),
  organization: z.string().min(1, 'Please select an organization.').max(120),
  registeredName: z.string().min(1, 'Please enter a registered name.').max(200),
  breed: z.string().min(1, 'Please select a breed.').max(120),
  variety: z.string().max(120).optional(),
  registrationNumber: z
    .string()
    .min(1, 'Please enter a registration number.')
    .max(64)
    .regex(REGISTRATION_NUMBER_PATTERN, 'Only letters, numbers, hyphens, and slashes are allowed.'),
  status: z.enum(REGISTRATION_STATUS_VALUES),
  originalStatus: z.string().max(120).optional(),
  applicationNumber: z.string().max(64).optional(),
  submissionDate: z.string().max(40).optional(),
  registrationDate: z.string().max(40).optional(),
  certificate: z.string().max(500).optional(),
});

export type RegistrationFormData = z.infer<typeof registrationFormSchema>;

export const INITIAL_REGISTRATION_DATA: RegistrationFormData = {
  id: '',
  organization: '',
  registeredName: '',
  breed: '',
  variety: '',
  registrationNumber: '',
  status: 'Active',
};

/** Matches a stored status to an allowed one ignoring case; only a value matching none reads as Active. */
function normalizeRegistrationStatus(status: string): RegistrationFormData['status'] {
  const wanted = status.trim().toLowerCase();
  return REGISTRATION_STATUS_VALUES.find(v => v.toLowerCase() === wanted) ?? 'Active';
}

/** A stored registration as the form's data. */
export function registrationToFormData(reg: Registration): RegistrationFormData {
  const status = normalizeRegistrationStatus(reg.status);
  return {
    id: reg.id,
    organization: reg.organization,
    registeredName: reg.registeredName,
    breed: reg.breed,
    variety: reg.variety,
    registrationNumber: reg.registrationNumber,
    status,
    originalStatus: reg.status,
    applicationNumber: reg.applicationNumber,
    submissionDate: reg.submissionDate,
    registrationDate: reg.registrationDate,
    certificate: reg.certificate,
  };
}

/** Preserve an untouched stored status exactly; a deliberate choice saves the new value. */
export function registrationStatusForSave(data: RegistrationFormData): string {
  return data.originalStatus !== undefined &&
    normalizeRegistrationStatus(data.originalStatus) === data.status
    ? data.originalStatus
    : data.status;
}

function generateRegistrationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `reg-${crypto.randomUUID()}`;
  }
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The validated form as an in-memory `Registration`, with a generated id when it has none. */
export function formDataToRegistration(data: RegistrationFormData): Registration {
  return {
    id: data.id || generateRegistrationId(),
    organization: data.organization,
    registeredName: data.registeredName,
    breed: data.breed,
    registrationNumber: data.registrationNumber,
    status: registrationStatusForSave(data),
    ...(data.variety != null && { variety: data.variety }),
    ...(data.applicationNumber != null && { applicationNumber: data.applicationNumber }),
    ...(data.submissionDate != null && { submissionDate: data.submissionDate }),
    ...(data.registrationDate != null && { registrationDate: data.registrationDate }),
    ...(data.certificate != null && { certificate: data.certificate }),
  };
}
