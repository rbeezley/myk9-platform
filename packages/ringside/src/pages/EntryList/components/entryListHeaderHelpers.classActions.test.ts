/**
 * MYK9-1697 (D6): the entry list has no ⋮ of its own. `buildClassMenuActions`
 * turns the page's permissions into the "This class" group the host menu lists,
 * so its order and gating are what a judge sees.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildClassMenuActions, type ActionsMenuConfig } from './entryListHeaderHelpers';

const everything = (): ActionsMenuConfig => ({
  showRunOrder: true,
  showRecalculatePlacements: true,
  showClassSettings: true,
  onRunOrderClick: vi.fn(),
  onRecalculatePlacements: vi.fn(),
  onClassSettingsClick: vi.fn(),
  onSetMaxTimeClick: vi.fn(),
});

const ids = (config: ActionsMenuConfig) => buildClassMenuActions(config).map(action => action.id);

describe('buildClassMenuActions', () => {
  it('lists the actions in the old ⋮ order: run order, placements, options, max time', () => {
    expect(ids(everything())).toEqual(['run-order', 'recalculate', 'class-options', 'max-time']);
  });

  it('lists nothing a viewer may not do', () => {
    expect(
      ids({
        ...everything(),
        showRunOrder: false,
        showRecalculatePlacements: false,
        showClassSettings: false,
        onSetMaxTimeClick: undefined,
      })
    ).toEqual([]);
  });

  it('omits an action whose flag is on but whose handler is missing', () => {
    expect(ids({ ...everything(), onRunOrderClick: undefined })).not.toContain('run-order');
  });

  it('runs the page handler it was given', () => {
    const config = everything();
    buildClassMenuActions(config)
      .find(action => action.id === 'class-options')
      ?.onSelect();
    expect(config.onClassSettingsClick).toHaveBeenCalledTimes(1);
  });
});
