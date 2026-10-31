import { ClassDefinition, ClassTemplate } from '@/types/template.types';
import { isPersonQualifiedForOrganization } from '@/features/judges/qualifiedJudges';
import { resolveConfiguredRegistryId } from '@/features/registries';
import type { User } from '@/types/user-types';

export interface ExistingClassIdentity {
  element: string;
  level?: string | undefined;
  section?: string | undefined;
}

export interface WizardClassItem {
  templateId: string;
  customizations: Record<string, unknown>;
  judgeId?: string | undefined;
}

const normalizeClassPart = (value: unknown) => String(value ?? '');

export const getClassIdentityKey = (classInfo: ExistingClassIdentity) =>
  [
    normalizeClassPart(classInfo.element),
    normalizeClassPart(classInfo.level),
    normalizeClassPart(classInfo.section),
  ].join('|');

export const getWizardClassIdentityKey = (classItem: WizardClassItem) =>
  getClassIdentityKey({
    element: normalizeClassPart(classItem.customizations.element),
    level: normalizeClassPart(classItem.customizations.level),
    section: normalizeClassPart(classItem.customizations.section),
  });

export const buildWizardClassItem = (
  classDefinition: ClassDefinition,
  templateId: string,
  judgeId?: string
): WizardClassItem => ({
  templateId,
  customizations: {
    ...classDefinition,
    fieldOverrides: {},
  },
  judgeId,
});

export const buildRetainedClassDefinition = (
  classItem: WizardClassItem,
  templateDefinition?: ClassDefinition
): ClassDefinition => ({
  ...templateDefinition,
  ...classItem.customizations,
  className: normalizeClassPart(classItem.customizations.className) || 'Unknown Class',
  element: normalizeClassPart(classItem.customizations.element) || 'Unknown Element',
  displayOrder:
    typeof classItem.customizations.displayOrder === 'number'
      ? classItem.customizations.displayOrder
      : (templateDefinition?.displayOrder ?? 0),
});

export const mergeTemplateWithRetainedClassDefinitions = (
  template: ClassTemplate,
  retainedClasses: ClassDefinition[]
): ClassTemplate => {
  const retainedByKey = new Map(
    retainedClasses.map(classDefinition => [getClassIdentityKey(classDefinition), classDefinition])
  );
  const templateKeys = new Set(template.classDefinitions.map(getClassIdentityKey));

  return {
    ...template,
    classDefinitions: [
      ...template.classDefinitions.map(
        definition => retainedByKey.get(getClassIdentityKey(definition)) ?? definition
      ),
      ...retainedClasses.filter(
        classDefinition => !templateKeys.has(getClassIdentityKey(classDefinition))
      ),
    ],
  };
};

export const mergeSelectedClassesWithExisting = (
  existingTrialClasses: WizardClassItem[],
  selectedClasses: ClassDefinition[],
  existingDBClasses: ExistingClassIdentity[],
  templateId: string,
  judgeAssignments: Record<string, string>
): WizardClassItem[] => {
  const existingDBKeys = new Set(existingDBClasses.map(getClassIdentityKey));
  const preservedExistingClasses = existingTrialClasses.filter(classItem =>
    existingDBKeys.has(getWizardClassIdentityKey(classItem))
  );

  const selectedClassItems = selectedClasses
    .filter(classDefinition => !existingDBKeys.has(getClassIdentityKey(classDefinition)))
    .map(classDefinition =>
      buildWizardClassItem(classDefinition, templateId, judgeAssignments[classDefinition.className])
    );

  const selectedItemsByKey = new Map(
    selectedClassItems.map(classItem => [getWizardClassIdentityKey(classItem), classItem])
  );

  return [
    ...preservedExistingClasses.filter(
      classItem => !selectedItemsByKey.has(getWizardClassIdentityKey(classItem))
    ),
    ...selectedClassItems,
  ];
};

/**
 * The show's judge ids that may be offered for a class: only people holding an active
 * qualification for the show's registry (MYK9-1580). The class panel applies the same
 * rule, so a judge offered here cannot later read "unavailable" there.
 */
export function judgeIdsQualifiedForShow(
  judgeIds: readonly string[],
  people: readonly User[],
  organization: string | null | undefined
): string[] {
  return judgeIds.filter(id => {
    const person = people.find(p => p.id === id);
    return person ? isPersonQualifiedForOrganization(person, organization) : false;
  });
}

/**
 * What step 3's empty judge state should say. `hidden` while people are still loading
 * (the list would read as empty for the wrong reason); a specific message when the show
 * HAS judges but none holds credentials for its registry.
 */
export function noJudgesNoticeFor(
  judgeCount: number,
  qualifiedCount: number,
  context: { peopleLoaded: boolean; organization: string | null | undefined }
): { hidden: boolean; message?: string } {
  if (judgeCount === 0) return { hidden: false };
  if (!context.peopleLoaded) return { hidden: true };
  if (qualifiedCount > 0) return { hidden: false };
  const registry = resolveConfiguredRegistryId(context.organization) ?? 'registry';
  return {
    hidden: false,
    message: `None of this show's judges have ${registry} credentials yet. Go back and add their ${registry} numbers.`,
  };
}
