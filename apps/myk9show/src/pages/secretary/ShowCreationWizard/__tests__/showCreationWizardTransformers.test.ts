import { describe, expect, it } from 'vitest';
import {
  createClassDataFromWizard,
  filterDuplicateWizardClasses,
  type WizardTrial,
} from '../showCreationWizardTransformers';

describe('createClassDataFromWizard registry identity preflight', () => {
  it.each(['scent_work', 'SCENT_WORK'])(
    'normalizes %s and refuses an unresolved selected class by name before it can be persisted',
    trialType => {
      const trials: WizardTrial[] = [
        {
          id: 'trial-1',
          name: 'Saturday Trial',
          dateTime: '2026-10-01T09:00:00',
          eventNumber: 'EVT-001',
          trialType,
          classes: [
            {
              templateId: 'akc-template',
              customizations: {
                className: 'Container Novice A — retained clone',
                element: 'Unknown',
                level: 'Novice',
                section: 'A',
              },
            },
          ],
        },
      ];

      expect(() =>
        createClassDataFromWizard(
          trials,
          { 'trial-1': 'trial-real' },
          {},
          'show-1',
          [],
          undefined,
          undefined,
          'AKC'
        )
      ).toThrow(/Container Novice A — retained clone/);
    }
  );

  it('requires registry sections where the registry defines them', () => {
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '2026-10-01T09:00:00',
        eventNumber: 'EVT-001',
        trialType: 'Scent Work',
        classes: [
          {
            templateId: 'akc-template',
            customizations: {
              className: 'Container Novice',
              element: 'Container',
              level: 'Novice',
            },
          },
        ],
      },
    ];

    expect(() =>
      createClassDataFromWizard(
        trials,
        { 'trial-1': 'trial-real' },
        {},
        'show-1',
        [],
        undefined,
        undefined,
        'AKC'
      )
    ).toThrow(/Container Novice/);
  });

  it('allows an ASCA base class without a section alongside additive Level C classes', () => {
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '2026-10-01T09:00:00',
        eventNumber: 'EVT-001',
        trialType: 'Scent Detection',
        classes: [
          {
            templateId: 'asca-template',
            customizations: {
              className: 'Container Novice',
              element: 'Container',
              level: 'Novice',
            },
          },
          {
            templateId: 'asca-template',
            customizations: {
              className: 'Container Novice Level C',
              element: 'Container',
              level: 'Novice',
              section: 'C',
            },
          },
        ],
      },
    ];

    expect(
      createClassDataFromWizard(
        trials,
        { 'trial-1': 'trial-real' },
        {},
        'show-1',
        [],
        undefined,
        undefined,
        'ASCA'
      ).map(classData => [classData.element, classData.level, classData.section])
    ).toEqual([
      ['Container', 'Novice', ''],
      ['Container', 'Novice', 'C'],
    ]);
  });

  it('persists a legacy plural element alias as the canonical registry label', () => {
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '2026-10-01T09:00:00',
        eventNumber: 'EVT-001',
        trialType: 'Scent Work',
        classes: [
          {
            templateId: 'akc-template',
            customizations: {
              className: 'Containers Novice A — legacy label',
              element: 'Containers',
              level: 'Novice',
              section: 'A',
            },
          },
        ],
      },
    ];

    expect(
      createClassDataFromWizard(
        trials,
        { 'trial-1': 'trial-real' },
        {},
        'show-1',
        [],
        undefined,
        undefined,
        'AKC'
      )[0]?.element
    ).toBe('Container');
  });

  it('still rejects a legacy alias with an invalid class triple', () => {
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '2026-10-01T09:00:00',
        eventNumber: 'EVT-001',
        trialType: 'Scent Work',
        classes: [
          {
            templateId: 'akc-template',
            customizations: {
              className: 'Containers Master A — invalid section',
              element: 'Containers',
              level: 'Master',
              section: 'A',
            },
          },
        ],
      },
    ];

    expect(() =>
      createClassDataFromWizard(
        trials,
        { 'trial-1': 'trial-real' },
        {},
        'show-1',
        [],
        undefined,
        undefined,
        'AKC'
      )
    ).toThrow(/Containers Master A — invalid section/);
  });

  it('deduplicates legacy and canonical aliases using the persisted triple identity', () => {
    const trial: WizardTrial = {
      id: 'trial-1',
      name: 'Saturday Trial',
      dateTime: '2026-10-01T09:00:00',
      eventNumber: 'EVT-001',
      trialType: 'Scent Work',
      classes: [
        {
          templateId: 'akc-template',
          customizations: {
            className: 'Containers Novice A — legacy',
            element: 'Containers',
            level: 'Novice',
            section: 'A',
          },
        },
        {
          templateId: 'akc-template',
          customizations: {
            className: 'Container Novice A — canonical',
            element: 'Container',
            level: 'Novice',
            section: 'A',
          },
        },
      ],
    };

    const classes = createClassDataFromWizard(
      [trial],
      { 'trial-1': 'trial-real' },
      {},
      'show-1',
      [],
      undefined,
      undefined,
      'AKC'
    );

    expect(classes).toHaveLength(1);
    expect(filterDuplicateWizardClasses(classes, new Set(), 'AKC')).toHaveLength(1);
  });

  it('allows a standalone registry class whose level is intentionally omitted', () => {
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        dateTime: '2026-10-01T09:00:00',
        eventNumber: 'EVT-001',
        trialType: 'Scent Work',
        classes: [
          {
            templateId: 'akc-template',
            customizations: {
              className: 'Detective',
              element: 'Detective',
              level: 'Detective',
            },
          },
        ],
      },
    ];

    expect(
      createClassDataFromWizard(
        trials,
        { 'trial-1': 'trial-real' },
        {},
        'show-1',
        [],
        undefined,
        undefined,
        'AKC'
      )
    ).toMatchObject([{ element: 'Detective', level: '', section: '' }]);
  });
});
