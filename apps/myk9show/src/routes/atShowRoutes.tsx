/**
 * At-Show Routes — unified ringside mount.
 *
 * Registers the at-show ringside routes that mount `@myk9/ringside` pages:
 *  - `/at-show/:showId`                           → class picker (1a)
 *  - `/at-show/:showId/class/:classId`            → single-class EntryList (1a)
 *  - `/at-show/:showId/class/:classIdA/:classIdB` → combined Section A/B list (1h)
 *  - `/at-show/:showId/class/:classId/score/:entryId` → live scoresheet
 * Mounted OUTSIDE UnifiedAppLayout (full-screen ringside — no host sidebar or
 * header; see App.tsx), which is why the gate's states use a full-screen wrapper.
 *
 * Enablement is per-show and asynchronous (Phase 1d): routes are registered
 * unconditionally, and `UnifiedRingsideGate` reads `shows.unified_ringside_enabled`
 * for the `:showId` in the URL, rendering an inline notice when off — never a
 * 404. `AtShowAccessGate` admits either account staff or a matching show-scoped
 * passcode grant, so QR/passcode ringside access works without account RBAC.
 */

import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';
import { UnifiedRingsideGate } from '@/features/at-show/UnifiedRingsideGate';
import { AtShowAccessGate } from '@/features/at-show/AtShowAccessGate';

const AtShowEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowEntryListPage' }
);

const AtShowCombinedEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowCombinedEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowCombinedEntryListPage' }
);

const AtShowScoresheetPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowScoresheetPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowScoresheetPage' }
);

const AtShowClassListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowClassListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowClassListPage' }
);

/**
 * Wrap an at-show page in the shared guard stack: access gate → suspense →
 * per-show enablement gate → page transition.
 */
function atShowElement(page: ReactNode): ReactNode {
  return (
    <AtShowAccessGate>
      <SuspenseWrapper>
        <UnifiedRingsideGate>
          <PageTransition>{page}</PageTransition>
        </UnifiedRingsideGate>
      </SuspenseWrapper>
    </AtShowAccessGate>
  );
}

/** At-show ringside routes — mounted full-screen, outside UnifiedAppLayout. */
export const AtShowRoutes = () => {
  return (
    <>
      {/* Class picker — the navigation entry into the at-show flow. */}
      <Route path="/at-show/:showId" element={atShowElement(<AtShowClassListPage />)} />
      <Route
        path="/at-show/:showId/class/:classId"
        element={atShowElement(<AtShowEntryListPage />)}
      />
      {/* Combined Novice Section A/B — two class ids (A + B run together). */}
      <Route
        path="/at-show/:showId/class/:classIdA/:classIdB"
        element={atShowElement(<AtShowCombinedEntryListPage />)}
      />
      {/* Live scoresheet (judge's mobile timer) — entry cards navigate here. */}
      <Route
        path="/at-show/:showId/class/:classId/score/:entryId"
        element={atShowElement(<AtShowScoresheetPage />)}
      />
    </>
  );
};
