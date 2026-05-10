export type PremiumStyle =
  | 'monogram'
  | 'banner'
  | 'headline'
  | 'magazine'
  | 'poster'
  | 'gazette'
  | 'fieldGuide'
  | 'heritage';

export const PREMIUM_STYLE_LABELS: Record<PremiumStyle, string> = {
  monogram: 'Monogram',
  banner: 'Banner',
  headline: 'Headline',
  magazine: 'Magazine',
  poster: 'Poster',
  gazette: 'Gazette',
  fieldGuide: 'Field Guide',
  heritage: 'Heritage',
};

export const DEFAULT_PREMIUM_STYLE: PremiumStyle = 'monogram';

const _VALID_PREMIUM_STYLES = new Set<string>(Object.keys(PREMIUM_STYLE_LABELS));

export function resolvePremiumStyle(style: string | null | undefined): PremiumStyle {
  return _VALID_PREMIUM_STYLES.has(style ?? '') ? (style as PremiumStyle) : DEFAULT_PREMIUM_STYLE;
}

export function getPremiumStyleOptions(): Array<{ value: PremiumStyle; label: string }> {
  return (Object.keys(PREMIUM_STYLE_LABELS) as PremiumStyle[]).map(value => ({
    value,
    label:
      value === DEFAULT_PREMIUM_STYLE
        ? `${PREMIUM_STYLE_LABELS[value]} (default)`
        : PREMIUM_STYLE_LABELS[value],
  }));
}

export interface ClubPremiumTemplate {
  id: string;
  clubId: string;
  name: string;
  trialType: string | null;
  isDefault: boolean;
  style: PremiumStyle;
  vetClinicName: string | null;
  vetClinicAddress: string | null;
  vetClinicPhone: string | null;
  accommodations: Array<{ name: string; address: string; phone: string }>;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PremiumSupplemental {
  vetClinic: { name: string; address: string; phone: string } | null;
  accommodations: Array<{ name: string; address: string; phone: string }>;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
}

export interface GeneratedPremium {
  org: 'AKC' | 'UKC';
  style: PremiumStyle;
  templateId: string | null;
  show: {
    name: string;
    startDate: string;
    endDate: string;
    venue: string;
    entryOpenDate: string | null;
    entryCloseDate: string | null;
    preEntryFee: number;
    dayOfFee: number;
    acceptChecks: boolean;
    acceptCash: boolean;
  };
  club: { name: string; logoUrl: string | null };
  secretary: {
    name: string | null;
    email: string | null;
    phone: string | null;
    mailingAddress: string | null;
  };
  officials: { chairman: string | null; steward: string | null };
  trials: Array<{
    name: string;
    date: string;
    startTime: string | null;
    eventNumber: string | null;
    type: string;
    judges: Array<{ name: string; elements: string[] }>;
    classes: Array<{ element: string; level: string; section: string | null }>;
  }>;
  supplemental: PremiumSupplemental;
  narratives: {
    showHours: string;
    trialInformation: string;
  };
}

export interface PremiumFieldOverride {
  templateValue: unknown;
  finalValue: unknown;
}

export interface PremiumNarrativeEdit {
  generatedValue: string;
  finalValue: string;
}

export interface PremiumGeneration {
  id: string;
  showId: string;
  clubId: string;
  templateId: string | null;
  org: 'AKC' | 'UKC';
  generatedAt: string;
  fieldOverrides: Record<string, PremiumFieldOverride>;
  narrativeEdits: Record<string, PremiumNarrativeEdit>;
}
