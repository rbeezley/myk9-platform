import { AKC_SCENT_WORK_LEVELS, ELEMENT_COLUMN_HEADERS } from '@/lib/reports/entryFormTypes';
import type { ClassVariant, ElementSpec, LevelSpec, Registry, RegistrySport } from './types';

/**
 * AKC scent-work class structure, derived from the same source consts the rest of the
 * app already uses (`AKC_SCENT_WORK_LEVELS`, `ELEMENT_COLUMN_HEADERS`) so the richer
 * `RegistrySport` shape carries identical data — no drift. (Phase 0 of the multi-registry
 * plan: docs/plan-multi-registry-scent-work.md.)
 */

// Novice is split A/B by ownership; the other levels have a single base class.
const NOVICE_AB: readonly ClassVariant[] = [
  { key: 'A', label: 'A', kind: 'ownership' },
  { key: 'B', label: 'B', kind: 'ownership' },
];

// The four progression levels (Novice → Master), plus Detective as its own single-level element.
const AKC_LEVELS: readonly LevelSpec[] = [
  ...AKC_SCENT_WORK_LEVELS.map((label, i) => ({ key: label.toLowerCase(), label, order: i + 1 })),
  { key: 'detective', label: 'Detective', order: AKC_SCENT_WORK_LEVELS.length + 1 },
];

const PROGRESSION_LEVEL_KEYS = AKC_SCENT_WORK_LEVELS.map(l => l.toLowerCase());

/** Standard grid element with Novice A/B (Container, Interior, Exterior, Buried). */
function gridElement(label: string): ElementSpec {
  return {
    key: label.toLowerCase(),
    label,
    columnHeader: ELEMENT_COLUMN_HEADERS[label as keyof typeof ELEMENT_COLUMN_HEADERS],
    grid: true,
    levels: PROGRESSION_LEVEL_KEYS,
    variantsByLevel: { novice: NOVICE_AB },
  };
}

const AKC_ELEMENTS: readonly ElementSpec[] = [
  gridElement('Container'),
  gridElement('Interior'),
  gridElement('Exterior'),
  gridElement('Buried'),
  // Handler Discrimination: same four levels (Novice also split A/B), rendered outside the grid.
  {
    key: 'hd',
    label: 'Handler Discrimination',
    columnHeader: ELEMENT_COLUMN_HEADERS['Handler Discrimination'],
    grid: false,
    levels: PROGRESSION_LEVEL_KEYS,
    variantsByLevel: { novice: NOVICE_AB },
  },
  // Detective: its own element, exactly one level, no sections.
  {
    key: 'detective',
    label: 'Detective',
    columnHeader: ELEMENT_COLUMN_HEADERS['Detective'],
    grid: false,
    levels: ['detective'],
  },
];

const akcScentWork: RegistrySport = {
  levels: AKC_LEVELS,
  elements: AKC_ELEMENTS,
  division: {
    container: 'Odor Search',
    interior: 'Odor Search',
    exterior: 'Odor Search',
    buried: 'Odor Search',
    hd: 'Handler Discrimination',
    detective: 'Detective',
  },
};

/**
 * Exhibitor agreement — three paragraphs joined with '\n\n'. The original three
 * blocks lived in AKCScentWorkEntryForm.tsx; this is the canonical source. Any
 * change to legal text MUST update the snapshot test in __tests__/akc.test.ts
 * and be reviewed by a human, not a model.
 */
const AKC_AGREEMENT_PARA_1 = `I certify that I am the actual owner of the dog, or that I am the duly authorized agent of the actual owner whose name I have entered. In consideration of the acceptance of this entry, I (we) agree to abide by the rules and regulations of The American Kennel Club in effect at the time of this event, and any additional rules and regulations appearing in the premium list of this event and entry form and any decision made in accord with them. I (we) agree that the club holding this event has the right to refuse this entry for cause which the club shall deem sufficient. I (we) certify and represent that the dog entered is not a hazard to persons or other dogs. In consideration of the acceptance of this entry and of the holding of this event and of the opportunity to have the dog judged and to win prizes, ribbons, or trophies, I (we) agree to hold the AKC, the event-giving club, their members, directors, governors, officers, agents, superintendents or event secretary and the owner and/or lessor of the premises and any provider of services that are necessary to hold this event and any employees or volunteers of the aforementioned parties, and any AKC approved judge, judging at this event, harmless from any claim for loss or injury which may be alleged to have been caused directly or indirectly to any person or thing by the act of this dog while in or about the event premises or grounds or near any entrance thereto, and I (we) personally assume all responsibility and liability for any such claim; and I (we) further agree to hold the aforementioned parties harmless from any claim of loss, injury or damage to this dog.`;

const AKC_AGREEMENT_PARA_2 = `Additionally, I (we) hereby assume the sole responsibility for and agree to indemnify, defend and save the aforementioned parties harmless from any and all loss and expense (including legal fees) by reason of the liability imposed by law upon any of the aforementioned parties for damage because of bodily injuries, including death at any time resulting therefrom, sustained by any person or persons, including myself (ourselves), or on account of damage to property, arising out of or in consequence of my (our) participation in this event, however such injuries, death or property damage may be caused, and whether or not the same may have been caused or may be alleged to have been caused by the negligence of the aforementioned parties or any of their employees, agents, or any other person.`;

const AKC_AGREEMENT_PARA_3 = `I (WE) AGREE THAT ANY CAUSE OF ACTION, CONTROVERSY OR CLAIM ARISING OUT OF OR RELATED TO THE ENTRY, EXHIBITION OR ATTENDANCE AT THE EVENT BETWEEN THE AKC AND THE EVENT-GIVING CLUB (UNLESS OTHERWISE STATED IN THIS PREMIUM LIST) AND MYSELF (OURSELVES) OR AS TO THE CONSTRUCTION, INTERPRETATION AND EFFECT OF THIS AGREEMENT SHALL BE SETTLED BY ARBITRATION PURSUANT TO THE APPLICABLE RULES OF THE AMERICAN ARBITRATION ASSOCIATION. HOWEVER, PRIOR TO ARBITRATION ALL APPLICABLE AKC BYLAWS, RULES, REGULATIONS, AND PROCEDURES MUST FIRST BE FOLLOWED AS SET FORTH IN THE AKC CHARTER AND BYLAWS, RULES, REGULATIONS, PUBLISHED POLICIES AND GUIDELINES.`;

export const AKC_EXHIBITOR_AGREEMENT = [
  AKC_AGREEMENT_PARA_1,
  AKC_AGREEMENT_PARA_2,
  AKC_AGREEMENT_PARA_3,
].join('\n\n');

export const akcRegistry: Registry = {
  id: 'AKC',
  name: 'American Kennel Club',
  shortName: 'A.K.C.',
  licenseLanguage: 'An A.K.C. Licensed Trial',
  memberClubLanguage: 'A member club of the American Kennel Club',
  exhibitorAgreement: AKC_EXHIBITOR_AGREEMENT,
  registrationField: {
    label: 'A.K.C. registration number',
    pattern: null,
  },
  sports: {
    'scent-work': akcScentWork,
  },
  dogFields: {
    required: ['registeredName', 'callName', 'breed', 'sex', 'dateOfBirth', 'registrationNumber'],
    optional: ['variety', 'sire', 'dam', 'breeder', 'placeOfBirth'],
  },
};
