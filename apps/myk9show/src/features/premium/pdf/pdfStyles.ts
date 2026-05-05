import { StyleSheet } from '@react-pdf/renderer';
import type { PremiumStyle } from '../../../types/premium-types';

// ─── Style tokens ────────────────────────────────────────────────────────────

export const STYLE_TOKENS = {
  classic: {
    bodyFont: 'Times-Roman' as const,
    boldFont: 'Times-Bold' as const,
    accentColor: '#1a1a5e',
    dividerColor: '#1a1a5e',
    sectionTitleAlign: 'center' as const,
  },
  modern: {
    bodyFont: 'Helvetica' as const,
    boldFont: 'Helvetica-Bold' as const,
    accentColor: '#0f172a',
    dividerColor: '#94a3b8',
    sectionTitleAlign: 'left' as const,
  },
  minimal: {
    bodyFont: 'Helvetica' as const,
    boldFont: 'Helvetica-Bold' as const,
    accentColor: '#000000',
    dividerColor: '#000000',
    sectionTitleAlign: 'left' as const,
  },
};

export function buildStyles(style: PremiumStyle) {
  const t = STYLE_TOKENS[style];
  return StyleSheet.create({
    page: { fontFamily: t.bodyFont, fontSize: 10, padding: 36, color: '#1a1a1a' },
    header: { alignItems: 'center', marginBottom: 12 },
    clubName: {
      fontFamily: t.boldFont,
      fontSize: 16,
      color: t.accentColor,
      textAlign: 'center',
    },
    showName: {
      fontFamily: t.boldFont,
      fontSize: 13,
      color: t.accentColor,
      textAlign: 'center',
      marginTop: 4,
    },
    subheader: { textAlign: 'center', marginTop: 2 },
    divider: { borderBottomWidth: 1, borderBottomColor: t.dividerColor, marginVertical: 8 },
    sectionTitle: {
      fontFamily: t.boldFont,
      fontSize: 11,
      color: t.accentColor,
      textAlign: t.sectionTitleAlign,
      marginBottom: 4,
      marginTop: 8,
    },
    row: { flexDirection: 'row', marginBottom: 3 },
    label: { fontFamily: t.boldFont, width: 120 },
    value: { flex: 1 },
    required: { color: '#cc0000' },
    body: { marginBottom: 4 },
    trialBlock: { marginBottom: 8, paddingLeft: 8 },
    trialTitle: { fontFamily: t.boldFont, fontSize: 10, marginBottom: 2 },
    indent: { paddingLeft: 12 },
    boilerplate: { fontSize: 9, color: '#444444', marginBottom: 4 },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}
