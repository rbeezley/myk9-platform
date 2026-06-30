import { describe, expect, it } from 'vitest';
import { buildMoveUpTargets } from './buildMoveUpTargets';
import type { ShowMapClassInput } from './showMapTypes';

function makeClass(overrides: Partial<ShowMapClassInput> & { id: string }): ShowMapClassInput {
  return {
    trialId: 'trial-1',
    name: overrides.id,
    ...overrides,
  };
}

const containerNovice = makeClass({
  id: 'container-novice',
  name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
});
const containerAdvanced = makeClass({
  id: 'container-advanced',
  name: 'Container Advanced',
  element: 'Container',
  level: 'Advanced',
});
const containerMaster = makeClass({
  id: 'container-master',
  name: 'Container Master',
  element: 'Container',
  level: 'Master',
});
const interiorAdvanced = makeClass({
  id: 'interior-advanced',
  name: 'Interior Advanced',
  element: 'Interior',
  level: 'Advanced',
});

describe('buildMoveUpTargets', () => {
  it('offers only same-element higher-level classes (no cross-element, no lower)', () => {
    const targets = buildMoveUpTargets(
      [containerNovice, containerAdvanced, containerMaster, interiorAdvanced],
      containerNovice.id
    );
    expect(targets.map(t => t.id)).toEqual([containerAdvanced.id, containerMaster.id]);
  });

  it('returns [] for a top-level class with no higher target in the same element', () => {
    // Container Master is present; nothing in the show is a higher Container level.
    const targets = buildMoveUpTargets(
      [containerNovice, containerAdvanced, containerMaster, interiorAdvanced],
      containerMaster.id
    );
    expect(targets).toEqual([]);
  });

  it('returns [] when the current class id is missing or unknown', () => {
    expect(buildMoveUpTargets([containerAdvanced], undefined)).toEqual([]);
    expect(buildMoveUpTargets([containerAdvanced], 'nope')).toEqual([]);
  });
});

describe('buildMoveUpTargets — registry-aware (Phase 5b)', () => {
  const ascaContainerOpen = makeClass({
    id: 'container-open',
    name: 'Container Open',
    element: 'Container',
    level: 'Open',
  });

  it('without a registryId arg (AKC default), ASCA-only Open is excluded as unknown', () => {
    const targets = buildMoveUpTargets([containerNovice, ascaContainerOpen], containerNovice.id);
    expect(targets.map(t => t.id)).not.toContain(ascaContainerOpen.id);
  });

  it('passing ASCA recognizes Open as a valid higher-level target', () => {
    const targets = buildMoveUpTargets(
      [containerNovice, ascaContainerOpen],
      containerNovice.id,
      'ASCA'
    );
    expect(targets.map(t => t.id)).toEqual([ascaContainerOpen.id]);
  });
});
