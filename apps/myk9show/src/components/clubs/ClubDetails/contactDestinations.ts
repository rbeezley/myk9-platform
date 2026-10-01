import { canonicalizeWebsiteUrl } from '@/lib/websiteUrl';

export interface ContactDestinations {
  email: string | null;
  phone: string | null;
  /** Canonical http(s) URL (no credentials), or null when absent/unsafe. */
  website: string | null;
}

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeContactDestinations(input: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  website?: string | null | undefined;
}): ContactDestinations {
  const email = normalizedText(input.email);
  const phone = normalizedText(input.phone);

  return {
    email: email ? `mailto:${email}` : null,
    phone: phone ? `tel:${phone}` : null,
    website: canonicalizeWebsiteUrl(input.website),
  };
}
