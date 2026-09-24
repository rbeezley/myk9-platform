/**
 * Pure helpers that turn a past show into a wizard clone snapshot. Shared by the clone picker
 * (start a clone) and the clone status banner (retry a failed one) through useCloneFromShow.
 */
import { getClassesByTrialId } from '@/services/database/classes';
import type { CloneHydrationSnapshot } from '@/store/wizardStore';
import type { Class, Show, ShowTrial } from '@/types/show-types';
import type { ClassTemplate } from '@/types/template.types';

interface ClonePerson {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  judgeQualifications?: Array<{ organization: string }> | null | undefined;
}

export async function getCloneSourceTrials(show: Show): Promise<ShowTrial[]> {
  if (!show.trials?.length) return [];

  return await Promise.all(
    show.trials.map(async trial => {
      if (trial.classes?.length) return trial;

      // Show-list reads can come from a cold replicated class store. Hydrate the selected
      // trial lazily so clone preserves class structure without widening every list query.
      const { data, error } = await getClassesByTrialId(trial.id);
      if (error) throw error;
      if (data.length === 0) return trial;

      return {
        ...trial,
        classes: data.map(mapFetchedClassToShowClass),
      };
    })
  );
}

/** Build the atomic snapshot the wizard store applies once every source class has loaded. */
export function buildCloneSnapshot(args: {
  show: Show;
  sourceTrials: ShowTrial[];
  people: readonly ClonePerson[];
  templates: ClassTemplate[];
}): CloneHydrationSnapshot {
  const { show, sourceTrials, people, templates } = args;
  const judges = (show.assignedJudges || []).map(assignment => {
    const person = people.find(candidate => candidate.id === assignment.judgeId);
    return {
      judgeId: assignment.judgeId,
      details: {
        name: person
          ? `${person.firstName} ${person.lastName}`
          : assignment.judgeName || 'Unknown Judge',
        email: person?.email || '',
        phone: person?.phone || '',
        certifications: person?.judgeQualifications?.map(q => q.organization) || [],
        notes: '',
      },
    };
  });

  const trials = sourceTrials.map(trial => {
    const sourceClasses = trial.classes || [];
    // Wizard state stores one template id per class. Normal trial data is single-sport, and
    // customizations preserve the visible class details if the template cannot be recovered.
    const template = resolveCloneTemplate({
      templates,
      organization: show.organization,
      trialType: trial.trialType,
      classes: sourceClasses,
    });

    return {
      nameOverride: trial.name || 'Trial',
      dateTime: '',
      eventNumber: '',
      trialType: trial.trialType,
      classes: sourceClasses.map(cls => {
        const judgeId =
          (show.assignedJudges || []).find(judge => judge.assignedClasses?.includes(cls.id))
            ?.judgeId || undefined;

        return {
          templateId: cls.templateId || template?.id || '',
          customizations: {
            className: cls.name,
            element: cls.element,
            level: cls.level,
            section: cls.section,
            entryFee: cls.entryFee,
            hidesUsed: cls.hidesUsed,
            distractionsUsed: cls.distractionsUsed,
            itemsUsed: cls.itemsUsed,
            timeLimit1: cls.timeLimit1,
            timeLimit2: cls.timeLimit2,
            timeLimit3: cls.timeLimit3,
          },
          ...(judgeId ? { judgeId } : {}),
        };
      }),
    };
  });

  return {
    sourceShowId: show.id,
    sourceShowName: show.name,
    show: {
      name: show.name,
      organization: show.organization as 'AKC' | 'UKC' | 'Other',
      location: show.location || '',
      clubId: show.clubId || '',
      preEntryFee: parseFloat(show.preEntryFee) || 0,
      dayOfShowFee: parseFloat(show.dayOfShowFee || '0') || 0,
      startingArmbandNumber: show.startingArmbandNumber ?? 100,
      acceptCheckPayments: show.acceptCheckPayments ?? false,
      acceptCashPayments: show.acceptCashPayments ?? false,
      judgeIds: judges.map(judge => judge.judgeId),
      // Dates are intentionally left blank so the secretary fills them in.
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
    },
    judgeDetails: Object.fromEntries(judges.map(({ judgeId, details }) => [judgeId, details])),
    trials,
  };
}

function mapFetchedClassToShowClass(value: Record<string, unknown>): Class {
  const name = optionalString(value.name) || optionalString(value.className) || 'Unnamed Class';
  const entryFee = optionalNumber(value.entry_fee ?? value.entryFee);

  return {
    id: optionalString(value.id) || name,
    templateId: optionalString(value.template_id ?? value.templateId),
    name,
    description: optionalString(value.description),
    entryFee,
    level: optionalString(value.level),
    element: optionalString(value.element),
    section: optionalString(value.section),
    hidesUsed: optionalString(value.hides_used ?? value.hidesUsed),
    distractionsUsed: optionalString(value.distractions_used ?? value.distractionsUsed),
    itemsUsed: optionalString(value.items_used ?? value.itemsUsed),
    timeLimit1: optionalString(value.time_limit1 ?? value.timeLimit1),
    timeLimit2: optionalString(value.time_limit2 ?? value.timeLimit2),
    timeLimit3: optionalString(value.time_limit3 ?? value.timeLimit3),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function resolveCloneTemplate(args: {
  templates: ClassTemplate[];
  organization: string;
  trialType?: string | undefined;
  classes: Class[];
}): ClassTemplate | undefined {
  const normalizedOrganization = normalizeText(args.organization);
  const normalizedTrialType = normalizeText(args.trialType);
  const sourceClasses = args.classes.filter(cls => cls.name || cls.element || cls.level);

  const candidates = args.templates.filter(template => {
    if (!template.isActive) return false;

    const templateOrganization = normalizeText(template.organization);
    const organizationMatches =
      templateOrganization === normalizedOrganization ||
      normalizedOrganization.includes(templateOrganization) ||
      templateOrganization.includes(normalizedOrganization);
    if (!organizationMatches) return false;

    if (!normalizedTrialType) return true;

    const templateTrialType = normalizeText(template.trialType);
    return (
      templateTrialType === normalizedTrialType ||
      templateTrialType.includes(normalizedTrialType) ||
      normalizedTrialType.includes(templateTrialType)
    );
  });

  const best = candidates
    .map(template => ({ template, score: scoreTemplateMatch(template, sourceClasses) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return undefined;
  if (sourceClasses.length > 0 && best.score === 0) return undefined;
  return best.template;
}

function scoreTemplateMatch(template: ClassTemplate, sourceClasses: Class[]): number {
  if (sourceClasses.length === 0) return 0;

  return sourceClasses.reduce((score, cls) => {
    const normalizedClassName = normalizeText(cls.name);
    const normalizedElement = normalizeText(cls.element);
    const normalizedLevel = normalizeText(cls.level);

    const hasMatchingClass = template.classDefinitions.some(def => {
      const classNameMatches =
        normalizedClassName !== '' && normalizeText(def.className) === normalizedClassName;
      const elementMatches =
        normalizedElement !== '' && normalizeText(def.element) === normalizedElement;
      const levelMatches = normalizedLevel === '' || normalizeText(def.level) === normalizedLevel;

      return classNameMatches || (elementMatches && levelMatches);
    });

    return hasMatchingClass ? score + 1 : score;
  }, 0);
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim();
}
