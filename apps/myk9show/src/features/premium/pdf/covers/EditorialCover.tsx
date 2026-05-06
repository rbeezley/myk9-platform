import { Page, Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../../types/premium-types';
import { AtAGlancePanel } from '../AtAGlancePanel';
import type { CoverContext } from './coverContext';

// ─── Editorial (Magazine) ────────────────────────────────────────────────────
//
// Cormorant Garamond display title above a tagline (date · venue) and an
// At-a-Glance panel filling the lower portion of the page in lieu of a hero
// image (image upload deferred — panel always renders).
export function renderEditorialCover({ t, data, dateRange, club, venue, org }: CoverContext) {
  const fallback = composeTagline(dateRange, venue);
  const tagline = pickWelcome(readWelcome(data), fallback);

  return (
    <Page size="LETTER" style={{ backgroundColor: t.surfaceColor, padding: 0 }}>
      <View style={{ flex: 1, paddingHorizontal: 64, paddingTop: 80, paddingBottom: 56 }}>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 8,
            color: t.secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: 4,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {org} · Premium List
        </Text>
        <Text
          style={{
            fontFamily: t.bodyFont,
            fontSize: 10,
            color: t.accentColor,
            textTransform: 'uppercase',
            letterSpacing: 2,
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          {club}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontSize: 48,
            color: t.accentColor,
            textAlign: 'center',
            lineHeight: 1.05,
            marginBottom: 18,
          }}
        >
          {data.show.name}
        </Text>
        <Text
          style={{
            fontFamily: t.displayFont,
            fontStyle: 'italic',
            fontSize: 13,
            color: t.secondaryColor,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {tagline}
        </Text>
        <AtAGlancePanel data={data} tokens={t} />
      </View>
    </Page>
  );
}

// Optional narrative field. The base GeneratedPremium type doesn't yet declare
// a welcome-from-chair string, but readers may pass one through richer fixture
// data. Read defensively so the cover gracefully ignores it when absent.
function readWelcome(data: GeneratedPremium): string | null {
  const candidate = (data as { welcomeFromChair?: unknown }).welcomeFromChair;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function composeTagline(dateRange: string, venue: string): string {
  return venue ? `${dateRange} · ${venue}` : dateRange;
}

// Threshold below which a welcome string is considered too thin to act as a
// tagline ("Welcome." → fallback to date+venue). Trimmed length, not raw.
const MIN_TAGLINE_LENGTH = 20;

/**
 * Pick the cover tagline. Prefers the welcome-from-chair narrative (truncated
 * to a single sentence-ish snippet) when it has enough substance; otherwise
 * falls back to the date+venue composition.
 *
 * Exported for tests; not part of the public component API.
 */
export function pickWelcome(welcome: string | null | undefined, fallback: string): string {
  const trimmed = welcome?.trim();
  if (!trimmed || trimmed.length < MIN_TAGLINE_LENGTH) return fallback;
  return firstSentence(trimmed);
}

/**
 * Length-capped truncator that prefers a sentence terminator (`.`, `!`, `?`)
 * followed by whitespace + a capital letter — which sidesteps abbreviation
 * traps like "Dr. Smith…" returning just "Dr.". Falls back to the last word
 * boundary before 180 chars with an ellipsis when no clean break exists.
 *
 * Exported for tests; not part of the public component API.
 */
export function firstSentence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= 200) return trimmed;
  // Prefer cutting on a sentence terminator: . ! ? followed by space + capital,
  // but only if it sits in a reasonable window (60–180 chars).
  const match = trimmed.slice(60, 200).match(/[.!?]\s+[A-Z]/);
  if (match && match.index !== undefined) {
    const cut = 60 + match.index + 1; // include the terminator
    return trimmed.slice(0, cut);
  }
  // No clean break — hard cap with ellipsis at the last word boundary before 180.
  const fallback = trimmed.slice(0, 180);
  const lastSpace = fallback.lastIndexOf(' ');
  return (lastSpace > 60 ? fallback.slice(0, lastSpace) : fallback) + '…';
}
