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
  showPrintOptions: true,
  onRunOrderClick: vi.fn(),
  onRecalculatePlacements: vi.fn(),
  onClassSettingsClick: vi.fn(),
  onSetMaxTimeClick: vi.fn(),
  printOptions: [
    { label: 'Check-In Sheet', onClick: vi.fn(), icon: 'checkin' },
    { label: 'Results Sheet', onClick: vi.fn(), icon: 'results', disabled: true },
  ],
});

const ids = (config: ActionsMenuConfig) => buildClassMenuActions(config).map(action => action.id);

describe('buildClassMenuActions', () => {
  it('lists the actions in the old ⋮ order: run order, placements, options, max time, print', () => {
    expect(ids(everything())).toEqual([
      'run-order',
      'recalculate',
      'class-options',
      'max-time',
      'print-checkin',
      'print-results',
    ]);
  });

  it('lists nothing a viewer may not do', () => {
    expect(
      ids({
        ...everything(),
        showRunOrder: false,
        showRecalculatePlacements: false,
        showClassSettings: false,
        onSetMaxTimeClick: undefined,
        showPrintOptions: false,
      })
    ).toEqual([]);
  });

  it('omits an action whose flag is on but whose handler is missing', () => {
    expect(ids({ ...everything(), onRunOrderClick: undefined })).not.toContain('run-order');
  });

  it('disables Recalculate Placements while it runs, and passes a print option’s disabled state', () => {
    const actions = buildClassMenuActions({ ...everything(), isRecalculatingPlacements: true });
    expect(actions.find(action => action.id === 'recalculate')?.disabled).toBe(true);
    expect(actions.find(action => action.id === 'print-results')?.disabled).toBe(true);
    expect(actions.find(action => action.id === 'print-checkin')?.disabled).toBeUndefined();
  });

  it('runs the page handler it was given', () => {
    const config = everything();
    buildClassMenuActions(config)
      .find(action => action.id === 'class-options')
      ?.onSelect();
    expect(config.onClassSettingsClick).toHaveBeenCalledTimes(1);
  });
});
