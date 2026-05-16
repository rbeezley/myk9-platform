/**
 * Single source of truth for "which wizard-completion receipt renders
 * for `shows.landing_style = X`". Used by WorkflowStepContent and by
 * the cascade-routing test.
 *
 * The registry is keyed by ShowStyle (exhaustive), so any future style
 * value will fail typecheck unless it gains an entry.
 *
 * Two styles need props beyond the base HeritageEntryReceivedProps:
 *   - Banner: per-club `brandColor` (from `shows.brand_color`)
 *   - Monogram: pre-computed `monogramLetters` (derived from clubName)
 *
 * Rather than have those leak into the base prop shape, each registry
 * entry is a render function that receives the base props *plus* an
 * `extras` bundle carrying the style-specific values. Most entries
 * ignore the extras and just spread the base props.
 */

import { type ReactElement } from 'react';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';
import type { ShowStyle } from '@/features/registries';
import { HeritageEntryReceived } from '@/features/heritage/wizard/HeritageEntryReceived';
import { HeadlineEntryReceived } from '@/features/headline/wizard/HeadlineEntryReceived';
import { MonogramEntryReceived } from '@/features/monogram/wizard/MonogramEntryReceived';
import { BannerEntryReceived } from '@/features/banner/wizard/BannerEntryReceived';
import { FieldGuideEntryReceived } from '@/features/fieldGuide/wizard/FieldGuideEntryReceived';
import { GazetteEntryReceived } from '@/features/gazette/wizard/GazetteEntryReceived';
import { MagazineEntryReceived } from '@/features/magazine/wizard/MagazineEntryReceived';
import { PosterEntryReceived } from '@/features/poster/wizard/PosterEntryReceived';
import { buildMonogram } from '@/features/monogram/utils/buildMonogram';

/** Style-specific values the dispatcher carries alongside the base props. */
export interface StyledReceiptExtras {
  /** Per-club brand color hex (e.g. "#0d4d4f"). Used by Banner. */
  brandColor: string | null;
}

type StyledReceiptRenderer = (
  base: HeritageEntryReceivedProps,
  extras: StyledReceiptExtras
) => ReactElement;

export const STYLED_RECEIPT_BY_STYLE: Record<ShowStyle, StyledReceiptRenderer> = {
  heritage: base => <HeritageEntryReceived {...base} />,
  headline: base => <HeadlineEntryReceived {...base} />,
  monogram: base => (
    <MonogramEntryReceived {...base} monogramLetters={buildMonogram(base.clubName)} />
  ),
  banner: (base, extras) => (
    <BannerEntryReceived {...base} brandColor={extras.brandColor ?? undefined} />
  ),
  fieldGuide: base => <FieldGuideEntryReceived {...base} />,
  gazette: base => <GazetteEntryReceived {...base} />,
  magazine: base => <MagazineEntryReceived {...base} />,
  poster: base => <PosterEntryReceived {...base} />,
};
