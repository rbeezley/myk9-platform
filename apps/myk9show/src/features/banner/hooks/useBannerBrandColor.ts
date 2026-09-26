/**
 * useBannerBrandColor — resolves per-club Banner flag color into the colour
 * bundle the masthead, section accents, final-CTA band and primary buttons
 * need.
 *
 * The derivation itself lives in ONE place,
 * `supabase/functions/_shared/bannerBrandColors.ts`, which the confirmation
 * email imports too — so a club's flag reads identically on the page and in
 * the inbox (Outlook strips `color-mix()`/OKLCH, so the colours are baked in
 * JS rather than CSS). Every text colour it returns is guaranteed 4.5:1 on
 * its surface for any `shows.brand_color` hex (MYK9-765).
 */

import { useMemo } from 'react';
import {
  deriveBannerBrandColors,
  type BannerBrandColors,
} from '../../../../../../supabase/functions/_shared/bannerBrandColors.ts';

export { deriveBannerBrandColors, type BannerBrandColors };

interface BannerColorInput {
  brand_color?: string | null;
}

export function useBannerBrandColor(show: BannerColorInput | null | undefined): BannerBrandColors {
  return useMemo(() => deriveBannerBrandColors(show?.brand_color), [show?.brand_color]);
}
