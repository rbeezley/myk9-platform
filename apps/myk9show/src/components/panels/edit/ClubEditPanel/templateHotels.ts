import { canonicalizeAccommodationUrl } from '@/features/_shared/landing/landingData';
import type { ClubPremiumTemplate } from '@/types/premium-types';

export type TemplateHotel = ClubPremiumTemplate['accommodations'][number];

export const BLANK_HOTEL: TemplateHotel = { name: '', address: '', phone: '' };

/**
 * The hotel list as it is saved: fields trimmed, rows left entirely blank dropped, and any
 * stored link cleaned (or dropped when unsafe) by the same helper the public pages use.
 * Removing every hotel saves `[]`, which prints no hotels section.
 */
export function cleanTemplateHotels(hotels: TemplateHotel[]): TemplateHotel[] {
  return hotels
    .map(h => ({
      ...h,
      // Stored hotels are free-form jsonb: a field can be missing or null (the publish
      // schema reads them loosely too), so never trust the TypeScript shape here.
      name: (h.name ?? '').trim(),
      address: (h.address ?? '').trim(),
      phone: (h.phone ?? '').trim(),
    }))
    .filter(h => h.name || h.address || h.phone)
    .map(canonicalizeAccommodationUrl);
}
