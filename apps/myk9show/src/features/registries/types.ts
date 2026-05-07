/**
 * Registry config layer — supports sanctioning bodies (AKC, and later UKC, ASCA, CKC, etc.).
 * Per-trial registry binding lives on `trials.registry_id`. See plan:
 * docs/plans/2026-05-07-heritage-trial-pages-plan.md §4
 */

export type RegistryId = 'AKC';

export interface RegistryRegistrationField {
  /** Label shown next to the registration-number input (e.g. "A.K.C. registration number"). */
  label: string;
  /** Optional regex for client-side validation. `null` means no pattern check. */
  pattern: RegExp | null;
}

export interface RegistrySport {
  /** Levels in competition order, low → high (e.g. Novice → Master). */
  levels: readonly string[];
  /** Standard elements (used for class-grid columns). */
  elements: readonly string[];
  /** Special / non-grid classes (e.g. Handler Discrimination, Detective). */
  special: readonly string[];
  /** Short headers for class-grid columns, keyed by element name. */
  elementColumnHeaders: Readonly<Record<string, string>>;
}

export interface RegistryDogFields {
  /** Field keys that must be filled for an entry to be considered valid. */
  required: readonly string[];
  /** Field keys that are accepted but not required. */
  optional: readonly string[];
}

export interface Registry {
  id: RegistryId;
  /** Full registry name, e.g. "American Kennel Club". */
  name: string;
  /** Short / abbreviated form, e.g. "A.K.C." (with dots, period-styled). */
  shortName: string;
  /** Header phrase shown on premium / landing / blank artifacts. */
  licenseLanguage: string;
  /** Footer phrase used on landing + email. */
  memberClubLanguage: string;
  /**
   * The full exhibitor agreement, paragraphs joined with '\n\n'. Rendered as a
   * fully-justified block in the entry blank §V and referenced from the wizard
   * agreement-checkbox.
   */
  exhibitorAgreement: string;
  /** Registration-number input config. */
  registrationField: RegistryRegistrationField;
  /** Sport definitions keyed by sport id (e.g. 'scent-work'). */
  sports: Readonly<Record<string, RegistrySport>>;
  /** Dog-particulars field schema (which fields the entry blank §I expects). */
  dogFields: RegistryDogFields;
}
