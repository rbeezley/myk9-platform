interface OrganizationBadge {
  name: string;
  shortCode: string;
  bgColor: string;
  textColor: string;
}

/**
 * Registry badge colours come from THEME TOKENS, never raw hex (MYK9-92).
 *
 * The previous palette hardcoded `bg-[#1a365d]` / `bg-[#1a5f1a]` / `bg-gray-600`
 * and paired every one of them with `text-foreground`. A raw hex cannot follow
 * the light/dark theme trio, so `text-foreground` resolved to near-black ink on
 * navy in light mode — 1.5:1, a serious WCAG 1.4.3 failure axe flagged on the
 * dog cards. Each pair below is one of the design system's own
 * background/foreground couples, so both themes stay AA by construction.
 */
export const getOrganizationBadge = (orgName: string): OrganizationBadge => {
  const org = orgName.toLowerCase();

  if (org.includes('american kennel') || org === 'akc') {
    return {
      name: 'American Kennel Club',
      shortCode: 'AKC',
      bgColor: 'bg-primary',
      textColor: 'text-primary-foreground',
    };
  }

  if (org.includes('united kennel') || org === 'ukc') {
    return {
      name: 'United Kennel Club',
      shortCode: 'UKC',
      bgColor: 'bg-secondary',
      textColor: 'text-secondary-foreground',
    };
  }

  if (org.includes('australian shepherd') || org === 'asca') {
    return {
      name: 'Australian Shepherd Club of America',
      shortCode: 'ASCA',
      bgColor: 'bg-accent',
      textColor: 'text-accent-foreground',
    };
  }

  // Default for other organizations
  return {
    name: orgName,
    shortCode: orgName.substring(0, 3).toUpperCase(),
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
  };
};
