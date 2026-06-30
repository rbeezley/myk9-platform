import type { ClassVariant, ElementSpec, LevelSpec, Registry, RegistrySport } from './types';

/**
 * UKC Nosework registry config (Phase 3 of the multi-registry plan). Structure + legal text
 * from the scoping doc: docs/design_handoff_heritage/Multi-Registry Scoping.md §8 and §11.1
 * (sourced from the 2020 rulebook, 2021 trial manual, and the Official UKC Performance Entry
 * Form). Any change to legal text MUST update the snapshot test and be reviewed by a human.
 */

const UKC_WAIVER_PARA_1 = `All events are held under the Official Rules and Regulations of the United Kennel Club. Absolutely no alcoholic beverages, illegal drugs or firearms will be allowed on the grounds or in the buildings on the day of a UKC Licensed event. UKC, its agents and employees, and the host club assume no responsibility for any loss, damage, or injury sustained by spectators or by exhibitors and handlers, or to any of their dogs or property, and further assume no responsibility for injury to children not under the control of their parents or guardians. UKC and the host club are not responsible for loss, accidents or theft.`;

const UKC_WAIVER_PARA_2 = `By signing this form, I hereby agree to waive any claim, action, or lawsuit and further agree to indemnify and hold UKC, the host club and any approved UKC Judge harmless from any claims, actions or lawsuits resulting from my participation in this event, and any action, decision or judgment made by any UKC or host club representative or approved Judge under the official UKC Rules and Regulations governing this event. I acknowledge that the current Official UKC Rules and Regulations (Nosework) have been made available to me, and that I am familiar with their contents. My signature indicates that I understand and agree to the above and to abide by all of the current Official UKC Rules and Regulations.`;

const UKC_WAIVER_PARA_3 = `I have read and agree to the waiver on this form.`;

export const UKC_EXHIBITOR_AGREEMENT = [
  UKC_WAIVER_PARA_1,
  UKC_WAIVER_PARA_2,
  UKC_WAIVER_PARA_3,
].join('\n\n');

// UKC splits every level into A/B by ownership (B = not-owned dogs + championship legs).
const AB: readonly ClassVariant[] = [
  { key: 'A', label: 'A', kind: 'ownership' },
  { key: 'B', label: 'B', kind: 'ownership' },
];

function abForLevels(levelKeys: readonly string[]): Record<string, readonly ClassVariant[]> {
  const out: Record<string, readonly ClassVariant[]> = {};
  for (const key of levelKeys) out[key] = AB;
  return out;
}

// Full level vocabulary. The 3rd level is 'Superior' for the main elements but 'Excellent' for
// HD (same rank 3, different label) — modeled as two LevelSpecs that elements reference per-element.
const UKC_LEVELS: readonly LevelSpec[] = [
  { key: 'novice', label: 'Novice', order: 1 },
  { key: 'advanced', label: 'Advanced', order: 2 },
  { key: 'superior', label: 'Superior', order: 3 },
  { key: 'excellent', label: 'Excellent', order: 3 }, // HD's rank-3 label
  { key: 'master', label: 'Master', order: 4 },
  { key: 'elite', label: 'Elite', order: 5 },
];

const MAIN_LEVELS = ['novice', 'advanced', 'superior', 'master', 'elite'];
const HD_LEVELS = ['novice', 'advanced', 'excellent', 'master']; // no Superior label, no Elite

function gridElement(key: string, label: string, columnHeader: string): ElementSpec {
  return {
    key,
    label,
    columnHeader,
    grid: true,
    levels: MAIN_LEVELS,
    variantsByLevel: abForLevels(MAIN_LEVELS),
  };
}

const UKC_ELEMENTS: readonly ElementSpec[] = [
  gridElement('container', 'Container', 'Cont.'),
  gridElement('interior', 'Interior', 'Int.'),
  gridElement('exterior', 'Exterior', 'Ext.'),
  gridElement('vehicle', 'Vehicle', 'Veh.'),
  // Handler Discrimination: just another element, 4 levels (Excellent at rank 3, no Elite).
  {
    key: 'hd',
    label: 'Handler Discrimination',
    columnHeader: 'Handler Disc.',
    grid: false,
    levels: HD_LEVELS,
    variantsByLevel: abForLevels(HD_LEVELS),
  },
];

const ukcNosework: RegistrySport = {
  levels: UKC_LEVELS,
  elements: UKC_ELEMENTS,
};

export const ukcRegistry: Registry = {
  id: 'UKC',
  name: 'United Kennel Club',
  shortName: 'UKC',
  licenseLanguage: 'A UKC Licensed Nosework Trial',
  // UKC uses "host club" framing, not "member club"; this is the footer phrase.
  memberClubLanguage: 'Held under the Official Rules and Regulations of the United Kennel Club',
  exhibitorAgreement: UKC_EXHIBITOR_AGREEMENT,
  registrationField: {
    // Accepts a permanent UKC registration number, or a PL/LP/TL number.
    label: 'UKC registration number',
    pattern: null,
  },
  // Keyed 'scent-work' (the shared scent-sport family key); UKC's sport is Nosework.
  sports: {
    'scent-work': ukcNosework,
  },
  dogFields: {
    required: ['registeredName', 'callName', 'breed', 'sex', 'dateOfBirth', 'registrationNumber'],
    optional: ['variety', 'sire', 'dam', 'breeder', 'placeOfBirth'],
  },
};
