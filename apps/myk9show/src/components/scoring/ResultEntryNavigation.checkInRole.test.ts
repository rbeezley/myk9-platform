/**
 * exhibitor-ux-remediation (Codex review P2 regression pin).
 *
 * ResultEntryNavigation is a scoring/judge surface. It opens the shared
 * CheckInStatusDialog, whose `userRole` defaults to `'exhibitor'` — and the
 * exhibitor variant hides staff-only statuses (Conflict/Pulled) and uses
 * first-person copy. This surface must therefore pass an explicit STAFF role,
 * or scoring loses those statuses. Pinned at the source level because the
 * component's own test mocks CheckInStatusDialog to null (props aren't
 * observable through rendering there).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, './ResultEntryNavigation.tsx'), 'utf8');

describe('ResultEntryNavigation check-in dialog role', () => {
  it('passes an explicit staff userRole to CheckInStatusDialog (not the exhibitor default)', () => {
    const match = /<CheckInStatusDialog[\s\S]*?\/>/.exec(source);
    expect(match).not.toBeNull();
    const dialogJsx = match![0];
    expect(dialogJsx).toMatch(/userRole=["'](judge|secretary|gate_steward)["']/);
    expect(dialogJsx).not.toMatch(/userRole=["']exhibitor["']/);
  });
});
