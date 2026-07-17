import { describe, expect, it } from 'vitest';
import {
  ROLE_JOURNEY_MATRIX,
  ROLE_JOURNEY_THEMES,
  ROLE_JOURNEY_VIEWPORTS,
  resolveRoleJourneyPath,
  type RoleJourneyPathParams,
} from '../../test/e2e/qa/roleJourneyMatrix';

const PATH_PARAMS: RoleJourneyPathParams = {
  registrationShowId: 'registration-show',
  secretaryShowId: 'secretary-show',
};

describe('MYK9-17 role journey matrix', () => {
  it('covers every required role with a concrete journey and goal', () => {
    expect(ROLE_JOURNEY_MATRIX.map(scenario => scenario.role)).toEqual([
      'exhibitor',
      'secretary',
      'judge-steward',
      'admin',
    ]);

    for (const scenario of ROLE_JOURNEY_MATRIX) {
      expect(scenario.goal).not.toBe('');
      expect(scenario.routes.length).toBeGreaterThan(0);
      expect(scenario.checks).toContain('render');
      expect(scenario.checks).toContain('horizontal-overflow');
      expect(scenario.checks).toContain('console-errors');
    }
  });

  it('defines the phone, tablet, desktop, light, and dark coverage dimensions', () => {
    expect(ROLE_JOURNEY_VIEWPORTS.map(viewport => viewport.id)).toEqual([
      'phone',
      'tablet',
      'desktop',
    ]);
    expect(ROLE_JOURNEY_THEMES).toEqual(['light', 'dark']);
  });

  it('includes the interaction checks required by the issue', () => {
    const checks = new Set(ROLE_JOURNEY_MATRIX.flatMap(scenario => scenario.checks));

    expect(checks).toEqual(
      new Set([
        'render',
        'horizontal-overflow',
        'console-errors',
        'modal-feedback',
        'selected-state',
        'disabled-state',
        'visual-baseline',
      ])
    );
  });

  it('resolves every route template without leaving an unresolved placeholder', () => {
    for (const scenario of ROLE_JOURNEY_MATRIX) {
      for (const route of scenario.routes) {
        const path = resolveRoleJourneyPath(route.pathTemplate, PATH_PARAMS);
        expect(path, `${scenario.id}/${route.id}`).not.toMatch(/\{\w+\}/);
        expect(path).toMatch(/^\//);
      }
    }
  });
});
