import { StyleSheet } from '@react-pdf/renderer';
import type { PremiumStyle } from '../../../types/premium-types';

// ─── Style tokens ────────────────────────────────────────────────────────────

export const STYLE_TOKENS = {
  classic: {
    bodyFont: 'Times-Roman' as const,
    boldFont: 'Times-Bold' as const,
    accentColor: '#1a1a5e',
    dividerColor: '#1a1a5e',
    dividerWidth: 1.5,
    pagePadding: 48,
    bodyFontSize: 11,
    clubNameSize: 22,
    clubNameLetterSpacing: 1.5,
    showNameSize: 14,
    sectionTitleAlign: 'center' as const,
    sectionTitleSize: 12,
    sectionTitleTransform: 'uppercase' as const,
    sectionTitleLetterSpacing: 2,
    sectionTitleSpacing: 12,
    labelWidth: 130,
    rowSpacing: 4,
  },
  modern: {
    bodyFont: 'Helvetica' as const,
    boldFont: 'Helvetica-Bold' as const,
    accentColor: '#0f172a',
    dividerColor: '#cbd5e1',
    dividerWidth: 0.75,
    pagePadding: 40,
    bodyFontSize: 10,
    clubNameSize: 24,
    clubNameLetterSpacing: -0.5,
    showNameSize: 13,
    sectionTitleAlign: 'left' as const,
    sectionTitleSize: 9,
    sectionTitleTransform: 'uppercase' as const,
    sectionTitleLetterSpacing: 1.2,
    sectionTitleSpacing: 10,
    labelWidth: 110,
    rowSpacing: 3,
  },
  minimal: {
    bodyFont: 'Helvetica' as const,
    boldFont: 'Helvetica-Bold' as const,
    accentColor: '#000000',
    dividerColor: '#e5e5e5',
    dividerWidth: 0.5,
    pagePadding: 64,
    bodyFontSize: 9,
    clubNameSize: 14,
    clubNameLetterSpacing: 4,
    showNameSize: 10,
    sectionTitleAlign: 'left' as const,
    sectionTitleSize: 8,
    sectionTitleTransform: 'uppercase' as const,
    sectionTitleLetterSpacing: 3,
    sectionTitleSpacing: 18,
    labelWidth: 100,
    rowSpacing: 2,
  },
};

export function buildStyles(style: PremiumStyle) {
  const t = STYLE_TOKENS[style];
  return StyleSheet.create({
    page: {
      fontFamily: t.bodyFont,
      fontSize: t.bodyFontSize,
      padding: t.pagePadding,
      color: '#1a1a1a',
    },
    header: {
      alignItems: style === 'minimal' ? 'flex-start' : 'center',
      marginBottom: t.sectionTitleSpacing,
    },
    clubName: {
      fontFamily: t.boldFont,
      fontSize: t.clubNameSize,
      color: t.accentColor,
      textAlign: style === 'minimal' ? 'left' : 'center',
      letterSpacing: t.clubNameLetterSpacing,
      textTransform: style === 'minimal' ? 'uppercase' : 'none',
    },
    showName: {
      fontFamily: t.boldFont,
      fontSize: t.showNameSize,
      color: t.accentColor,
      textAlign: style === 'minimal' ? 'left' : 'center',
      marginTop: 4,
    },
    subheader: { textAlign: style === 'minimal' ? 'left' : 'center', marginTop: 2 },
    divider: {
      borderBottomWidth: t.dividerWidth,
      borderBottomColor: t.dividerColor,
      marginVertical: t.sectionTitleSpacing,
    },
    sectionTitle: {
      fontFamily: t.boldFont,
      fontSize: t.sectionTitleSize,
      color: t.accentColor,
      textAlign: t.sectionTitleAlign,
      textTransform: t.sectionTitleTransform,
      letterSpacing: t.sectionTitleLetterSpacing,
      marginBottom: t.sectionTitleSpacing / 2,
      marginTop: t.sectionTitleSpacing,
    },
    row: { flexDirection: 'row', marginBottom: t.rowSpacing },
    label: { fontFamily: t.boldFont, width: t.labelWidth },
    value: { flex: 1 },
    required: { color: '#cc0000' },
    body: { marginBottom: 4 },
    trialBlock: { marginBottom: 8, paddingLeft: style === 'classic' ? 8 : 0 },
    trialTitle: { fontFamily: t.boldFont, fontSize: t.bodyFontSize, marginBottom: 2 },
    indent: { paddingLeft: 12 },
    boilerplate: { fontSize: 9, color: '#444444', marginBottom: 4 },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(d: string) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  // Format in UTC so DATE-only columns (e.g., '2026-06-13', which JS parses as
  // midnight UTC) don't roll backward a day in negative-offset timezones.
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Format common US phone shapes; pass through anything else unchanged so we
// don't mangle international numbers or pre-formatted input.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}
