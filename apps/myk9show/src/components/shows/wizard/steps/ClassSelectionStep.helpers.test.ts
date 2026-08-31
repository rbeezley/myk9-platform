import { describe, expect, it } from 'vitest';
import {
  buildWizardClassItem,
  mergeSelectedClassesWithExisting,
  WizardClassItem,
} from './ClassSelectionStep.helpers';
import { ClassDefinition } from '@/types/template.types';

const classDefinition = (
  className: string,
  element: string,
  level: string,
  section: string
): ClassDefinition => ({
  className,
  element,
  level,
  section,
  displayOrder: 0,
});

describe('ClassSelectionStep helpers', () => {
  const existingClasses = [
    { element: 'Container', level: 'Novice', section: 'A' },
    { element: 'Interior', level: 'Novice', section: 'A' },
  ];

  const existingTrialClasses: WizardClassItem[] = existingClasses.map(existingClass =>
    buildWizardClassItem(
      classDefinition(
        `${existingClass.element} ${existingClass.level} ${existingClass.section}`,
        existingClass.element,
        existingClass.level,
        existingClass.section
      ),
      'template-1',
      'judge-existing'
    )
  );

  it('preserves DB-backed classes when a new class is selected in add-classes mode', () => {
    const selectedClasses = [
      classDefinition('Container Novice B', 'Container', 'Novice', 'B'),
    ];

    const merged = mergeSelectedClassesWithExisting(
      existingTrialClasses,
      selectedClasses,
      existingClasses,
      'template-1',
      { 'Container Novice B': 'judge-new' }
    );

    expect(merged).toHaveLength(3);
    expect(merged.map(cls => cls.customizations.className)).toEqual([
      'Container Novice A',
      'Interior Novice A',
      'Container Novice B',
    ]);
    expect(merged[2]?.judgeId).toBe('judge-new');
  });

  it('removes only unsaved selections when a newly added class is deselected', () => {
    const merged = mergeSelectedClassesWithExisting(
      existingTrialClasses,
      [],
      existingClasses,
      'template-1',
      {}
    );

    expect(merged).toHaveLength(2);
    expect(merged.map(cls => cls.customizations.className)).toEqual([
      'Container Novice A',
      'Interior Novice A',
    ]);
  });
});
