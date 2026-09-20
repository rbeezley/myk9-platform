import { describe, expect, it } from 'vitest';
import { createClassDataFromWizard, type WizardTrial } from '../showCreationWizardTransformers';

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
            customizations: { className: 'Detective', element: 'Detective' },
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
    ).toHaveLength(1);
  });
});
