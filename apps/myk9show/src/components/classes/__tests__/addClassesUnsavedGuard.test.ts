/**
 * COMPLETENESS guard: every Add-Classes surface must register an unsaved-changes guard.
 *
 * The class-edit panels get this free from `EditPanelWrapper`, which mounts
 * `UnsavedChangesRouteGuard`. The Add-Classes panel builds its own chrome
 * (`SlideOverPanel`) and so had no guard at all: any route change discarded
 * the class selection silently, including the "Add a judge" link the empty-roster notice
 * now offers.
 *
 * This is a source scan and says so. What it proves is only that the surface *mounts*
 * the guard and ties it to the selection — the guard's own blocking behaviour is the
 * router's, tested with the guard itself. What no rendering test can check is a NEW
 * Add-Classes surface appearing without one (add it to SURFACES), which is the failure this file exists to
 * catch: the equivalent gap in `SimpleClassSelector` was missed twice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../..');

// AddClassesToTrialDialog was a second surface until it was deleted as unused.
const SURFACES = ['components/classes/AddClassesToTrialPanel.tsx'];

describe('Add-Classes surfaces guard the class selection', () => {
  it.each(SURFACES)('%s mounts UnsavedChangesRouteGuard', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8');
    expect(source).toContain('<UnsavedChangesRouteGuard');
  });

  it.each(SURFACES)('%s ties dirtiness to the class selection', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8');
    const start = source.indexOf('<UnsavedChangesRouteGuard');
    const attrs = source.slice(start, source.indexOf('/>', start));

    // Guarding on something unrelated (or hardcoding false) would mount the component
    // and still lose the work.
    expect(attrs).toMatch(/isDirty=\{[^}]*selectedClasses\.length > 0/);
  });
});
