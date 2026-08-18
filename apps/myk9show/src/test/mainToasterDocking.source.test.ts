/**
 * Sonner must stay docked bottom-right, away from the custom notification
 * stack that owns the top-right corner (`components/notifications/
 * ToastContainer.tsx` renders at `top-[calc(var(--app-top-inset,3rem)+0.75rem)]`).
 *
 * MYK9-88 moved the `<Toaster>` out of `main.tsx` into `AppToaster`, which
 * lifts it above any mounted action bar. This test follows it there — the
 * docking decision is what matters, not which file expresses it. Left pointing
 * at main.tsx it would have passed vacuously after the move: every string it
 * looked for was simply gone, along with the component.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const toasterSource = readFileSync(
  join(__dirname, '..', 'components', 'layout', 'AppToaster.tsx'),
  'utf8'
);
const mainSource = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8');
const appSource = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

describe('Sonner toaster docking', () => {
  it('docks Sonner away from the custom top-right notification stack', () => {
    expect(toasterSource).toContain('position="bottom-right"');
    expect(toasterSource).not.toContain('position="top-right"');
  });

  it('keeps the safe-area insets on both desktop and mobile offsets', () => {
    expect(toasterSource).toContain('offset={offset}');
    expect(toasterSource).toContain('mobileOffset={offset}');
    expect(toasterSource).toContain('env(safe-area-inset-right)');
    expect(toasterSource).toContain('env(safe-area-inset-bottom)');
  });

  it('mounts exactly one Sonner Toaster, inside the router', () => {
    // AppToaster calls useLocation to clear stale toasts on navigation, so a
    // mount outside BrowserRouter would throw at runtime — and a second bare
    // <Toaster> anywhere would reintroduce an un-offset stack.
    expect(mainSource).toContain('<RouterProvider router={router} />');
    expect(mainSource).not.toMatch(/<Toaster\b/);
    expect(mainSource).not.toContain('<BrowserRouter>');
    expect(appSource).toContain('<AppToaster />');
    expect(appSource).toContain('<ToastContainer />');
  });
});
