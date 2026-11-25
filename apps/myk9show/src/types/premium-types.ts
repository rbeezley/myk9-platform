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
  coverImageUrl: string | null;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
  /** MYK9-2291 (ASCA §1.5.18): concerns for handicapped or limited-mobility handlers or dogs. */
  limitedMobilityNotes: string | null;
  /** MYK9-2291 (ASCA §1.5.22): RV hook-up amenities and availability. */
  rvHookupNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PremiumSupplemental {
  vetClinic: { name: string; address: string; phone: string } | null;
  accommodations: Array<{ name: string; address: string; phone: string }>;
  coverImageUrl: string | null;
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  additionalNotes: string | null;
  /** MYK9-2291 (ASCA §1.5.18); absent on a premium generated before it. Prints on ASCA only. */
  limitedMobilityNotes?: string | null;
  /** MYK9-2291 (ASCA §1.5.22); absent on a premium generated before it. Prints on ASCA only. */
  rvHookupNotes?: string | null;
}

/**
 * MYK9-1976: the show's refund and withdrawal policy as generate-premium reads it, in the row
 * shape `useEffectiveWithdrawalPolicy` selects (EFFECTIVE_WITHDRAWAL_SELECT): the show's
 * policy columns and text, its trials' registry, its club's defaults and text. The premium
 * resolves it with the app's own resolver, so it prints the text exhibitors read in the app.
 */
export interface PremiumWithdrawalRow {
  withdrawal_cutoff_date?: string | null;
  withdrawal_retention_type?: string | null;
  withdrawal_retention_value?: number | null;
  withdrawal_policy_notes?: string | null;
  withdrawal_policy_text?: string | null;
  trials?: Array<{ registry_id?: string | null }> | null;
  clubs?: {
    default_withdrawal_retention_type?: string | null;
    default_withdrawal_retention_value?: number | null;
    default_withdrawal_policy_notes?: string | null;
    default_withdrawal_policy_text?: string | null;
  } | null;
}

export interface GeneratedPremium {
  org: 'AKC' | 'UKC' | 'ASCA';
  style: PremiumStyle;
  templateId: string | null;
  show: {
    name: string;
    startDate: string;
    endDate: string;
    venue: string | null;
    entryOpenDate: string | null;
    entryCloseDate: string | null;
    preEntryFee: number | null;
    dayOfFee: number | null;
    acceptChecks: boolean;
    acceptCash: boolean;
    /** MYK9-2220: shows.max_total_entries; null or absent means no limit (UKC premiums print it). */
    maxTotalEntries?: number | null;
    /** Absent on premiums generated before MYK9-1976 part 2: those print no policy row. */
    withdrawal?: PremiumWithdrawalRow | null;
    /** MYK9-2231: shows.allow_waitlist, the default for a class with no setting of its own. */
    allowWaitlist?: boolean | null;
    /** MYK9-2231: shows.allow_class_changes_after_close; absent on an older premium (prints no line). */
    allowClassChangesAfterClose?: boolean | null;
    /** MYK9-2290 (ASCA §1.5.2): shows.asca_sanction_status; absent or null prints nothing. */
    ascaSanctionStatus?: 'pending' | 'approved' | null;
    /** MYK9-2290 (ASCA §1.5.9): shows.scents_by_level, free text. */
    scentsByLevel?: string | null;
    /** MYK9-2290 (ASCA §1.5.19): shows.spectators_policy. */
    spectatorsPolicy?: 'allowed' | 'not_allowed' | null;
    /** MYK9-2290 (ASCA §1.5.24): shows.photographer_contact, optional free text. */
    photographerContact?: string | null;
  };
  club: { name: string | null; logoUrl: string | null };
  secretary: {
    name: string | null;
    email: string | null;
    phone: string | null;
    mailingAddress: string | null;
  };
  officials: {
    chairman: {
      name: string;
      email: string | null;
      phone: string | null;
      /** MYK9-2065: typed by the club for the premium; absent before the field existed. */
      mailingAddress?: string | null;
    } | null;
  };
  /**
   * MYK9-2045: the host club's Officers list (position and name). Absent on a premium
   * generated before it, which prints no officers.
   */
  officers?: Array<{ position: string; name: string }>;
  /**
   * MYK9-2064: the show's Event Committee names (the show's own list, else the club's). Absent on
   * a premium generated before it, which prints no committee.
   */
  committee?: string[];
  trials: Array<{
    name: string;
    date: string;
    startTime: string | null;
    eventNumber: string | null;
    type: string;
    /**
     * MYK9-2067: `residence` is "City, ST" and `classes` are "Element Level Section" labels (empty
     * for a judge on every class). Both are absent on a premium generated before it, which also
     * carried `elements`; nothing reads `elements` any more.
     */
    judges: Array<{
      name: string;
      residence?: string | null;
      /** MYK9-2292 (ASCA §1.5.7); absent on a premium generated before it. Prints on ASCA only. */
      affiliation?: string | null;
      classes?: string[];
    }>;
    classes: Array<{
      element: string;
      level: string;
      section: string | null;
      /** MYK9-2231: classes.name, the label of a class with no element or level. */
      name?: string | null;
      /** MYK9-2231: classes.entry_fee, the class's own pre-entry fee; null or 0 follows the show. */
      entryFee?: number | null;
      /** MYK9-2231: classes.allow_waitlist; null follows the show's setting. */
      allowWaitlist?: boolean | null;
    }>;
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
  org: 'AKC' | 'UKC' | 'ASCA';
  generatedAt: string;
  fieldOverrides: Record<string, PremiumFieldOverride>;
  narrativeEdits: Record<string, PremiumNarrativeEdit>;
}
