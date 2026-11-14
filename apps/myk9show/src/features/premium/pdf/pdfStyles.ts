import { StyleSheet } from '@react-pdf/renderer';
import type { PremiumStyle } from '../../../types/premium-types';

// Side-effect import: registers all custom font families with @react-pdf.
import './pdfFonts';

import { resolveTokens, type BuildStylesOptions } from './pdfTokens';

// Re-export the token surface so existing import sites keep working.
export type { StyleTokens, OrgKey, ResolveTokensOptions, BuildStylesOptions } from './pdfTokens';
export {
  STYLE_TOKENS,
  STYLE_ORG_SUPPORT,
  INK_SAVER_PALETTE,
  resolveTokens,
  numberToRoman,
} from './pdfTokens';

export function buildStyles(style: PremiumStyle, opts?: BuildStylesOptions) {
  const t = resolveTokens(style, { inkSaver: opts?.inkSaver ?? false });
  return StyleSheet.create({
    page: {
      fontFamily: t.bodyFont,
      fontSize: t.bodyFontSize,
      padding: t.pagePadding,
      color: t.textColor,
      backgroundColor: '#ffffff',
    },

    // ─── Cover ─────────────────────────────────────────────────────────────
    coverPage: {
      fontFamily: t.bodyFont,
      fontSize: t.bodyFontSize,
      color: t.textColor,
      backgroundColor: t.surfaceColor,
      padding: 0,
    },
    coverFill: { flex: 1 },
    coverColorBand: {
      backgroundColor: t.accentColor,
      paddingHorizontal: t.pagePadding,
      paddingVertical: 56,
    },
    coverColorBandText: { color: t.surfaceColor },

    // ─── Header ────────────────────────────────────────────────────────────
    header: { alignItems: 'center', marginBottom: 16 },
    clubName: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 16,
      color: t.accentColor,
      textAlign: 'center',
    },
    showName: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 13,
      color: t.accentColor,
      textAlign: 'center',
      marginTop: 4,
    },
    subheader: { textAlign: 'center', marginTop: 2 },

    // ─── Section structure ─────────────────────────────────────────────────
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: t.accentColor,
      marginVertical: 16,
    },
    sectionTitle: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 9,
      color: t.accentColor,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 8,
      marginTop: 4,
    },

    // ─── Rows / labels ─────────────────────────────────────────────────────
    row: { flexDirection: 'row', marginBottom: 4 },
    label: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      width: 110,
      color: t.textColor,
    },
    value: { flex: 1 },
    required: { color: '#cc0000' },
    body: { marginBottom: 4 },

    // ─── Pull-quote / display data ─────────────────────────────────────────
    pullQuoteRow: { flexDirection: 'row', gap: 24, marginVertical: 12 },
    pullQuoteCell: { flex: 1 },
    pullQuoteValue: {
      fontFamily: t.displayFont,
      fontSize: 28,
      color: t.accentColor,
      lineHeight: 1.1,
    },
    pullQuoteLabel: {
      fontFamily: t.bodyFont,
      fontSize: 7,
      color: t.secondaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginTop: 4,
    },

    // ─── Trial blocks ──────────────────────────────────────────────────────
    trialBlock: {
      marginBottom: 12,
      paddingLeft: 0,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: t.secondaryColor,
    },
    trialTitle: {
      fontFamily: t.displayFont,
      fontSize: 14,
      color: t.accentColor,
      marginBottom: 4,
    },
    indent: { paddingLeft: 12 },
    boilerplate: { fontSize: 9, color: '#444444', marginBottom: 4 },
  });
}

// Shared formatting lives with the list of facts; re-exported so style files keep one import.
export { formatPremiumDate, formatPhone, buildMonogram } from '../premiumFacts';
