/**
 * Single source of truth for "which styled landing page renders for
 * `getShowStyle(show) = X` from `shows.style`. Used by ShowDetailsPage to pick the
 * component, and by the cascade-routing test to assert that every
 * `ShowStyle` value maps to a non-null component.
 *
 * Type is `Record<ShowStyle, ComponentType>` (not partial), so any
 * future ShowStyle value added to the union will fail typecheck unless
 * it gains a registry entry — eliminating the silent-fallthrough class
 * of bugs.
 */

import { type ComponentType } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ShowStyle } from '@/features/registries';
import { HeritageLandingPage } from '@/features/heritage/landing/HeritageLandingPage';
import { HeadlineLandingPage } from '@/features/headline/landing/HeadlineLandingPage';
import { MonogramLandingPage } from '@/features/monogram/landing/MonogramLandingPage';
import { BannerLandingPage } from '@/features/banner/landing/BannerLandingPage';
import { FieldGuideLandingPage } from '@/features/fieldGuide/landing/FieldGuideLandingPage';
import { GazetteLandingPage } from '@/features/gazette/landing/GazetteLandingPage';
import { MagazineLandingPage } from '@/features/magazine/landing/MagazineLandingPage';
import { PosterLandingPage } from '@/features/poster/landing/PosterLandingPage';

export interface StyledLandingProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
  hasEntryClassInventory?: boolean | null;
  /**
   * True when the show's entry window has not OPENED yet.
   *
   * The landings only ever checked `entryClosed`, so a show whose entries open
   * in three months advertised "Enter This Show" to every anonymous visitor and
   * sent them to a dead end. `getEntryStatus` has always handled `not_yet_open`
   * correctly -- it was just computed after the public branch had returned.
   */
  entryNotYetOpen?: boolean | undefined;
}

export const STYLED_LANDING_BY_STYLE: Record<ShowStyle, ComponentType<StyledLandingProps>> = {
  heritage: HeritageLandingPage,
  headline: HeadlineLandingPage,
  monogram: MonogramLandingPage,
  banner: BannerLandingPage,
  fieldGuide: FieldGuideLandingPage,
  gazette: GazetteLandingPage,
  magazine: MagazineLandingPage,
  poster: PosterLandingPage,
};
