export interface MonogramSectionFolioProps {
  /** Folio numeral, lowercase roman (i, ii, iii, iv, v, vi, vii, viii). */
  numeral: string;
  /** Font size in px. Defaults to 56 (matches the handoff section folio). */
  size?: number;
  /** Optional className for positioning. */
  className?: string;
}
