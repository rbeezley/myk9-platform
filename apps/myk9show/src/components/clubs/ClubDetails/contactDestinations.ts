export interface ContactDestinations {
  email: string | null;
  phone: string | null;
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
  const websiteValue = normalizedText(input.website);

  if (!websiteValue)
    return {
      email: email ? `mailto:${email}` : null,
      phone: phone ? `tel:${phone}` : null,
      website: null,
    };

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(websiteValue);
  if (hasExplicitScheme && !/^https?:\/\//i.test(websiteValue)) {
    return {
      email: email ? `mailto:${email}` : null,
      phone: phone ? `tel:${phone}` : null,
      website: null,
    };
  }

  const website = /^https?:\/\//i.test(websiteValue) ? websiteValue : `https://${websiteValue}`;
  try {
    const parsed = new URL(website);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return {
        email: email ? `mailto:${email}` : null,
        phone: phone ? `tel:${phone}` : null,
        website: null,
      };
    return {
      email: email ? `mailto:${email}` : null,
      phone: phone ? `tel:${phone}` : null,
      website: parsed.toString(),
    };
  } catch {
    return {
      email: email ? `mailto:${email}` : null,
      phone: phone ? `tel:${phone}` : null,
      website: null,
    };
  }
}
