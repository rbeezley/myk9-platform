import type { ClassVariant, ElementSpec, LevelSpec, Registry, RegistrySport } from './types';

/**
 * ASCA Scent Detection registry config (Phase 4 of the multi-registry plan). Structure + legal
 * text from the scoping doc: docs/design_handoff_heritage/Multi-Registry Scoping.md §9 and §11.2
 * (June 2026 ASCA Scent Detection Program Rules + the ASCA Scent Detection Entry Form). Any
 * change to legal text MUST update the snapshot test and be reviewed by a human.
 *
 * ASCA exercises the `continuation` variant path: each base level (Novice/Open/Advanced/Excellent)
 * has a base class AND a parallel "Level C" continuation class — both exist (unlike AKC/UKC's
 * ownership A/B, which replace the base).
 */

const ASCA_AGREEMENT_PARA_1 = `IMPORTANT LEGAL AGREEMENT — Please read the following carefully as it, among other things, may prevent you from suing ASCA® and persons/entities affiliated with it. This agreement could even require you to defend them from demands and suits by third parties that include an assertion of wrongdoing by you. (1) The person signing this Agreement represents being authorized to enter into it on behalf of him/herself, as well as (if different) the owner(s)/exhibitor(s)/handler(s) of the dog(s) for which an entry form is being submitted (all these parties collectively referred to herein as "Applicant"). (2) "Releasees" here collectively refers to the Australian Shepherd Club of America® (ASCA®); its affiliate clubs; and the officers and board of directors, staff, contractors, insurers, attorneys, and agents of ASCA® and of those clubs. (3) This Agreement voluntarily is entered into by Applicant in exchange for the acceptance of the associated entry form and permission to participate in related activities. (4) Applicant agrees to abide by the rules and regulations of ASCA® and any other rules and regulations applicable to this event. (5) Applicant certifies that the entered dog will not pose a hazard to people, property, stock animals, or other dogs, and further that the dog is current with rabies shots along with any other vaccinations required by its state of residence. (6) Applicant acknowledges and assumes the risks to Applicant and Applicant's dog associated with participation in the event, among which could be ones associated with poor condition of the facilities and surrounding areas; security measures or lack of them; electrical appliances; fittings; show rings; the presence of unfamiliar persons; and the presence/involvement of other animals — whether stock, dogs, or otherwise. (7) Applicant further agrees to comply with all recommended and required health and safety precautions, among which may be those related to social distancing; quarantining; wearing of face coverings; and non-participation of persons exhibiting symptoms or for whom there otherwise has been a likelihood of recent exposure to COVID-19 or other contagious diseases. (8) Applicant additionally acknowledges and agrees to assume the risks associated with taking part in the event though others might neglect compliance with health and safety precautions/requirements or pose an undue risk of spreading disease. For example, as is true as to any public event, there is some risk that Applicant and/or those affiliated with Applicant may catch COVID-19 or another contagious disease at the event. (9) To the maximum extent permissible, this release is to be interpreted under Texas law, without application of its choice of law rules. (10) To the extent that Applicant — or another party suing on behalf of Applicant, or suing to recover based on injuries/death/damage to Applicant/Applicant's dog/Applicant's property — sues ASCA® (or a board member or staff member or agent of ASCA®) as a defendant, the sole appropriate forum (to the maximum extent permitted by law) for the suit shall be the state or federal courts serving Brazos County, Texas (where ASCA® has its headquarters). (11) Applicant hereby releases and waives any claims Applicant otherwise might assert against the Releasees as to any injury or damage claim connected in any way to any alleged act or omission arising out of, or occurring concurrent with, the event and related activities, interactions, communications, and even adjacent premises. (12) This release is made not only as to Applicant but also for anyone who might assert a claim on behalf of Applicant or based on purported injury or damage to Applicant/Applicant's dog/Applicant's property, as well as any heir, beneficiary, assignee, executor, trustee, agent, or survivor of Applicant. (13) Applicant further agrees to assume sole responsibility for and indemnify and hold Releasees harmless from related claims, demands, judgments, and settlement payments. (14) These waiver, release, and indemnification provisions extend even to claims or demands asserting that the acts or omissions resulted in bodily injury or death or from intentional wrongdoing, as well as to attorney fees and other costs of defense. (15) The duties of indemnification further extend to any claims or demands asserted against Releasees that are alleged to have arisen out of the acts or omissions of Applicant, Applicant's dog, or others affiliated with Applicant. Among other things, this means that Applicant would pay the legal defense of Releasees if someone sued them based on a claim Applicant carelessly exposed the claimant to COVID-19. (16) Applicant's promises in this agreement apply without regard to the type of claim or cause of action asserted against Releasees. (17) To the extent any provision of this agreement is unenforceable, the remainder of it nonetheless is to be enforced. (18) This agreement is to be interpreted to provide Releasees with the maximum permissible legal protection from — among other things — claims and suits pursued by Applicant (and/or those acting on behalf of Applicant or over injury/damage to Applicant), as well as from ones based on the purported wrongful acts or omissions of Applicant. (19) Nothing in this Agreement requires you to indemnify Releasees from claims by third parties that involve no allegations of improper acts or omissions by you, those affiliated with you, nor your dog(s). (20) Applicant acknowledges having read, understood, and had the opportunity for independent legal review of this document prior to signing it.`;

const ASCA_AGREEMENT_PARA_2 = `AS USED HERE, "ASCA®" MEANS THE OWNER AND THE OPERATOR OF THE EVENT PREMISES, THE AUSTRALIAN SHEPHERD CLUB OF AMERICA, ITS AFFILIATE CLUBS, AND EACH OF THEIR MEMBERS, OFFICERS, DIRECTORS, EMPLOYEES, SHOW CHAIRMEN, SHOW COMMITTEES AND AGENTS.`;

const ASCA_AGREEMENT_PARA_3 = `PERSON SIGNING THIS FORM IS RESPONSIBLE FOR ALL ERRORS AND RULE VIOLATIONS.`;

export const ASCA_EXHIBITOR_AGREEMENT = [
  ASCA_AGREEMENT_PARA_1,
  ASCA_AGREEMENT_PARA_2,
  ASCA_AGREEMENT_PARA_3,
].join('\n\n');

// "Level C" (Continue) — additive: the base class still exists alongside it (kind: continuation).
const LEVEL_C: readonly ClassVariant[] = [{ key: 'C', label: 'Level C', kind: 'continuation' }];

function levelCForLevels(levelKeys: readonly string[]): Record<string, readonly ClassVariant[]> {
  const out: Record<string, readonly ClassVariant[]> = {};
  for (const key of levelKeys) out[key] = LEVEL_C;
  return out;
}

// 'Open' is ASCA-only; the other three labels are shared with AKC/UKC. These four are the
// complete set — the rulebook's competition levels are §5 Novice, §6 Open, §7 Advanced,
// §8 Excellent, and then §9 is Faults. There is no fifth level.
//
// There was previously a 'Champion' level here, on the assumption that "Level C" meant
// Champion. It does not: §3.2.2 defines Level C as a CONTINUATION track — 3 qualifying
// scores earn the base element title, 7 more (10 total) earn the Level C element title
// (SCNc-C, SCNi-C, …). That is already modeled by the LEVEL_C variant above, and no
// Champion Detection Level exists. Do not re-add one.
const ASCA_LEVELS: readonly LevelSpec[] = [
  { key: 'novice', label: 'Novice', order: 1 },
  { key: 'open', label: 'Open', order: 2 },
  { key: 'advanced', label: 'Advanced', order: 3 },
  { key: 'excellent', label: 'Excellent', order: 4 },
];

const BASE_LEVELS = ['novice', 'open', 'advanced', 'excellent']; // the four levels that carry Level C

// ASCA pluralizes element names on the printed entry-blank grid (matches the entry form).
const ASCA_GRID_LABELS: Record<string, string> = {
  Container: 'Containers',
  Interior: 'Interiors',
  Exterior: 'Exteriors',
  Vehicle: 'Vehicles',
};

function gridElement(key: string, label: string, columnHeader: string): ElementSpec {
  return {
    key,
    label,
    gridLabel: ASCA_GRID_LABELS[label] ?? label,
    columnHeader,
    grid: true,
    levels: BASE_LEVELS,
    variantsByLevel: levelCForLevels(BASE_LEVELS),
  };
}

// Four elements, every one of them a grid element. ASCA has no standalone off-grid element
// (unlike AKC's Detective or the Handler Discrimination both AKC and UKC run).
const ASCA_ELEMENTS: readonly ElementSpec[] = [
  gridElement('container', 'Container', 'Cont.'),
  gridElement('interior', 'Interior', 'Int.'),
  gridElement('exterior', 'Exterior', 'Ext.'),
  gridElement('vehicle', 'Vehicle', 'Veh.'),
];

const ascaScentDetection: RegistrySport = {
  levels: ASCA_LEVELS,
  elements: ASCA_ELEMENTS,
};

export const ascaRegistry: Registry = {
  id: 'ASCA',
  name: 'The Australian Shepherd Club of America',
  shortName: 'ASCA',
  licenseLanguage: 'An ASCA Sanctioned Scent Detection Trial',
  // ASCA sanctions trials run by affiliate clubs; this is the footer phrase.
  memberClubLanguage: 'Sanctioned by The Australian Shepherd Club of America',
  exhibitorAgreement: ASCA_EXHIBITOR_AGREEMENT,
  registrationField: {
    // Accepts LEP / QT (QTracker) / REGULAR ids.
    label: 'ASCA Registration # (LEP/QT/REGULAR)',
    pattern: null,
  },
  // Keyed 'scent-work' (the shared scent-sport family key); ASCA's sport is Scent Detection.
  sports: {
    'scent-work': ascaScentDetection,
  },
  dogFields: {
    required: ['registeredName', 'callName', 'breed', 'sex', 'dateOfBirth', 'registrationNumber'],
    optional: ['variety', 'sire', 'dam', 'breeder', 'placeOfBirth'],
  },
};
