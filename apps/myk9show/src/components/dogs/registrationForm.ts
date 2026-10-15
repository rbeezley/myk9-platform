/**
 * The one registration form's schema, shapes and mappers (MYK9-1117).
 *
 * Every host of the form validates against `registrationFormSchema`, whether it
 * writes an in-memory `Registration` for an unsaved dog (Add Dog) or saves to
 * the database (Dog Details and the entry wizard).
 */
import { z } from 'zod';
import type { Registration } from '@/types/dog-types';

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

/**
 * The select's full label for a stored organization. A bare short code (`AKC`,
 * matched case-insensitively) becomes its full label so the select shows it
 * selected and a save writes the label (MYK9-1207); anything else is unchanged.
 */
export function registrationOrgLabel(organization: string): string {
  if (REGISTRATION_ORGS.includes(organization)) return organization;
  const code = organization.trim().toLowerCase();
  // A bare code is either a breed-list code (`AKC`) or a label's leading word (`PAL`, `ILP`).
  return (
    REGISTRATION_ORGS.find(label => ORG_CODE_MAP[label]?.toLowerCase() === code) ??
    REGISTRATION_ORGS.find(label => label.split(' (')[0]?.toLowerCase() === code) ??
    organization
  );
}

/** What a registration saves under when the form left its organization empty: the full AKC label. */
export const DEFAULT_REGISTRATION_ORG = registrationOrgLabel('AKC');

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
  status: z.string().min(1, 'Please select a status.').max(120),
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

/** A stored registration as the form's data. */
export function registrationToFormData(reg: Registration): RegistrationFormData {
  return {
    id: reg.id,
    organization: registrationOrgLabel(reg.organization),
    registeredName: reg.registeredName,
    breed: reg.breed,
    variety: reg.variety,
    registrationNumber: reg.registrationNumber,
    status: reg.status,
    applicationNumber: reg.applicationNumber,
    submissionDate: reg.submissionDate,
    registrationDate: reg.registrationDate,
    certificate: reg.certificate,
  };
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
    status: data.status,
    ...(data.variety != null && { variety: data.variety }),
    ...(data.applicationNumber != null && { applicationNumber: data.applicationNumber }),
    ...(data.submissionDate != null && { submissionDate: data.submissionDate }),
    ...(data.registrationDate != null && { registrationDate: data.registrationDate }),
    ...(data.certificate != null && { certificate: data.certificate }),
  };
}
