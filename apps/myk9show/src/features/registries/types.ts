/**
 * Registry config layer — supports sanctioning bodies (AKC, and later UKC, ASCA, CKC, etc.).
 * Per-trial registry binding lives on `trials.registry_id`. See plan:
 * docs/plans/2026-05-07-heritage-trial-pages-plan.md §4
 */

export type RegistryId = 'AKC' | 'UKC';

export interface RegistryRegistrationField {
  /** Label shown next to the registration-number input (e.g. "A.K.C. registration number"). */
  label: string;
  /** Optional regex for client-side validation. `null` means no pattern check. */
  pattern: RegExp | null;
}

/**
 * Why a class is subdivided at a level. Registries split classes for different
 * reasons, and the kind matters for the (future) titles surface:
 *  - `ownership`    — A/B by who owns/handles the dog (AKC Novice; UKC every level).
 *  - `continuation` — a "keep titling at this level" track (ASCA "Level C").
 */
export type ClassVariantKind = 'ownership' | 'continuation';

export interface ClassVariant {
  /** Value stored in `classes.section` (e.g. 'A', 'B', 'C'). */
  key: string;
  /** Display label (e.g. 'A', 'B', 'Level C'). */
  label: string;
  kind: ClassVariantKind;
}

export interface LevelSpec {
  /** Stable internal key (e.g. 'novice'). */
  key: string;
  /** Display label as written on premiums/blanks and stored in `classes.level` (e.g. 'Novice'). */
  label: string;
  /** Progression rank, low → high. Drives class ordering (replaces the hardcoded premium LEVEL_ORDER). */
  order: number;
}

export interface ElementSpec {
  /** Stable internal key (e.g. 'container', 'hd', 'detective'). */
  key: string;
  /** Display label, as stored in `classes.element` (e.g. 'Container', 'Handler Discrimination'). */
  label: string;
  /**
   * Display label for the entry-blank §II grid, when it differs from `label` (AKC pluralizes:
   * 'Container' → 'Containers'). Defaults to `label`. This is the string the printed grid shows
   * and matches against `classes.element`, so it must stay stable for that surface.
   */
  gridLabel?: string;
  /** Short header when rendered as a class-grid column (e.g. 'Cont.'). Omitted for non-grid elements. */
  columnHeader?: string;
  /** True = a column in the main element grid; false = rendered separately (e.g. HD, Detective). */
  grid: boolean;
  /**
   * Level keys this element offers — PER ELEMENT, because level sets are not uniform within a
   * registry (UKC HD uses "Excellent" and has no Elite; AKC Detective has exactly one level).
   * Each key must resolve against `RegistrySport.levels`.
   */
  levels: readonly string[];
  /**
   * Class variants keyed by level key (e.g. `{ novice: [A, B] }`). A level absent from this map
   * has a single base class with no section. Omit entirely if the element has no subdivisions.
   */
  variantsByLevel?: Readonly<Record<string, readonly ClassVariant[]>>;
}

export interface RegistrySport {
  /** Every level this sport uses, with progression order. Superset of the keys elements reference. */
  levels: readonly LevelSpec[];
  /** Elements, each declaring its own level set + variants. */
  elements: readonly ElementSpec[];
  /**
   * Optional element-key → division grouping (e.g. AKC's Odor Search / Handler Discrimination /
   * Detective). Not needed to render the publishing config; reserved for the future titles surface.
   */
  division?: Readonly<Record<string, string>>;
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
