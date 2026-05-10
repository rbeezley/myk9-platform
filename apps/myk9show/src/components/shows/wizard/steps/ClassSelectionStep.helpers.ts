import { ClassDefinition } from '@/types/template.types';

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
      buildWizardClassItem(
        classDefinition,
        templateId,
        judgeAssignments[classDefinition.className]
      )
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
