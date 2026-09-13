import { useMemo } from 'react';
import { getShowStyle } from '@/features/registries';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import { StaleShowNotice } from './StaleShowNotice';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';

export interface ShowPublicLandingProps {
  /** The resolved show (already narrowed non-null by the page). */
  show: Show;
  /** Trials for the landing — store rows when warm, anon public rows when cold. */
  landingTrials: Trial[];
  /** Anonymous-safe class identity rows for the shared public preview. */
  offeredClasses?: ClassInfo[];
  /**
   * Whether the show's offered classes are known yet. `null` while unresolved;
   * the styled landing uses it to gate its "find your class" affordances. The
   * page always resolves this to `boolean | null` before rendering the landing,
   * so it is required (no `undefined`) to keep the null-means-unresolved contract
   * explicit.
   */
  hasEntryClassInventory: boolean | null;
  /** True when the entry window has not opened yet. */
  entryNotYetOpen: boolean;
  /** True when a cached show is being shown because the refresh failed. */
  refreshFailed?: boolean | undefined;
  onRetry?: (() => void) | undefined;
}

/**
 * The public / anonymous marketing landing for a show.
 *
 * Renders the styled landing page that matches the show's (published) style.
 * Audience gating — *whether* a visitor sees this vs. the exhibitor tabs or the
 * management shell — is the page's job; this component owns only the styled
 * landing render once that decision is made.
 */
export function ShowPublicLanding({
  show,
  landingTrials,
  offeredClasses = [],
  hasEntryClassInventory,
  entryNotYetOpen,
  refreshFailed,
  onRetry,
}: ShowPublicLandingProps) {
  // When an experience is published, its published style wins over the show's
  // current (possibly draft) style for public visitors.
  const publicLandingShow = useMemo(
    () =>
      show.experienceIsPublished && show.experiencePublishedStyle
        ? { ...show, style: show.experiencePublishedStyle }
        : show,
    [show]
  );

  const previewShow = useMemo(() => {
    if (offeredClasses.length === 0) return publicLandingShow;

    const offeredClassesByTrial = new Map<string, ClassInfo[]>();
    for (const classInfo of offeredClasses) {
      const classes = offeredClassesByTrial.get(classInfo.trialId) ?? [];
      classes.push(classInfo);
      offeredClassesByTrial.set(classInfo.trialId, classes);
    }

    return {
      ...publicLandingShow,
      trials: landingTrials.map(trial => ({
        id: trial.id,
        name: trial.name || trial.trialNumber || 'Trial',
        date: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        status: trial.status || '',
        classes: (offeredClassesByTrial.get(trial.id) ?? []).map(classInfo => ({
          id: classInfo.id,
          name: classInfo.name,
          element: classInfo.element,
          level: classInfo.level,
          section: classInfo.section,
        })),
      })),
    };
  }, [landingTrials, offeredClasses, publicLandingShow]);

  // INTENT: null/default style uses the product's committed Monogram default
  // for public visitors. That keeps the shareable show URL on a brand landing
  // without adding another default surface; management users still get the
  // tabbed product UI where show operations live.
  const publicShowStyle = getShowStyle(publicLandingShow);
  // The registry is exhaustive over every ShowStyle value (typecheck
  // enforces it), and getShowStyle() falls back to the committed
  // Monogram default for null/default/unknown values.
  const StyledLanding = STYLED_LANDING_BY_STYLE[publicShowStyle];

  return (
    <>
      {refreshFailed && onRetry && <StaleShowNotice onRetry={onRetry} />}
      <StyledLanding
        show={previewShow}
        trial={landingTrials[0] ?? null}
        allTrials={landingTrials}
        hasEntryClassInventory={hasEntryClassInventory}
        entryNotYetOpen={entryNotYetOpen}
      />
    </>
  );
}
