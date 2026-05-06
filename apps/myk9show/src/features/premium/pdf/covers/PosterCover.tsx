import { Page, Text, View } from '@react-pdf/renderer';
import { formatDate } from '../pdfStyles';
import type { CoverContext } from './coverContext';

// ─── Poster ──────────────────────────────────────────────────────────────────
//
// Bold, ink-hungry single-page hero. Stacked Archivo Black headline, a red
// ink-blot circle accent, a monospace meta strip, and a dark olive closing
// call-out card. The cover never wraps across pages — `wrap={false}` keeps
// the hero composition intact even when @react-pdf would otherwise split it.
export function renderPosterCover(ctx: CoverContext) {
  const { t, data, dateRange, club, venue, org } = ctx;
  const headlineLines = composeHeadlineLines(data.show.name, data.show.startDate);
  const meta = composeMetaStrip(ctx);
  const closing = composeClosing(data.show.entryCloseDate);

  return (
    <Page size="LETTER" style={{ backgroundColor: t.surfaceColor, padding: 0 }}>
      <View
        wrap={false}
        style={{
          flex: 1,
          paddingHorizontal: 56,
          paddingTop: 56,
          paddingBottom: 56,
          position: 'relative',
        }}
      >
        {/* Top eyebrow strip */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 36,
          }}
        >
          <Text
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 8,
              color: t.secondaryColor,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            {club}
          </Text>
          <Text
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 8,
              color: t.secondaryColor,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            {org} · Premium List
          </Text>
        </View>

        {/* Red ink-blot accent — rendered as a circle View positioned behind
            the headline. Translates the prototype's printer's ink-bleed motif. */}
        <View
          style={{
            position: 'absolute',
            top: 120,
            right: 40,
            width: 280,
            height: 280,
            borderRadius: 9999,
            backgroundColor: t.accentColor,
            opacity: 0.92,
          }}
        />

        {/* Stacked Archivo Black headline */}
        <View style={{ marginTop: 24 }}>
          {headlineLines.map((line, i) => (
            <Text
              key={i}
              style={{
                fontFamily: t.displayFont,
                fontSize: 84,
                lineHeight: 0.95,
                color: line.accent ? t.accentColor : t.secondaryColor,
                textTransform: 'uppercase',
              }}
            >
              {line.text}
            </Text>
          ))}
        </View>

        {/* Spacer pushes the meta strip + closing card toward the bottom */}
        <View style={{ flexGrow: 1 }} />

        {/* Monospace meta strip */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.secondaryColor,
            borderBottomWidth: 1,
            borderBottomColor: t.secondaryColor,
            paddingVertical: 10,
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 9,
              color: t.secondaryColor,
              letterSpacing: 1,
            }}
          >
            {meta}
          </Text>
        </View>

        {/* Closing call-out card */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View
            style={{
              width: 200,
              height: 96,
              backgroundColor: t.secondaryColor,
              padding: 14,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: 8,
                color: t.surfaceColor,
                textTransform: 'uppercase',
                letterSpacing: 2,
                marginBottom: 4,
              }}
            >
              Entries Close
            </Text>
            <Text
              style={{
                fontFamily: t.displayFont,
                fontSize: 18,
                color: t.surfaceColor,
                lineHeight: 1.05,
              }}
            >
              {closing.date}
            </Text>
            {closing.detail ? (
              <Text
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 8,
                  color: t.surfaceColor,
                  marginTop: 4,
                }}
              >
                {closing.detail}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Date + venue baseline (small, balanced against the closing card) */}
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 9,
              color: t.secondaryColor,
              letterSpacing: 1,
            }}
          >
            {dateRange}
            {venue ? ` · ${venue}` : ''}
          </Text>
        </View>
      </View>
    </Page>
  );
}

interface HeadlineLine {
  text: string;
  accent: boolean;
}

/**
 * Stack the show name into 3 display lines with a 2-digit year as the bottom
 * line. Short names (≤3 words) get one word per line; longer names take the
 * first 3 words.
 *
 * Exported for tests.
 */
export function composeHeadlineLines(showName: string, startDate: string): HeadlineLine[] {
  const words = showName.trim().split(/\s+/).filter(Boolean);
  const top = words.slice(0, 3);
  const year = extractTwoDigitYear(startDate);
  // Pad to 3 lines when the show name is shorter, so the visual mass stays
  // consistent across short and long names.
  while (top.length < 3 && top.length > 0) {
    top.push('');
  }
  const lines: HeadlineLine[] = top.map((w, i) => ({
    text: w,
    // Middle line gets the accent color — gives the stack a focal point.
    accent: i === 1,
  }));
  lines.push({ text: `'${year}`, accent: true });
  return lines.filter(l => l.text.length > 0);
}

function extractTwoDigitYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Fall back to the last 2 chars if the date is unparsable.
    return iso.slice(-2);
  }
  const y = d.getUTCFullYear() % 100;
  return y.toString().padStart(2, '0');
}

/**
 * One-line dense data strip for the Poster cover bottom rail.
 * Format: `LICENSE {n} · SECRETARY: {name} · CLOSING: {date} {time}`.
 *
 * Exported for tests.
 */
export function composeMetaStrip(ctx: CoverContext): string {
  const parts: string[] = [];
  const license = readLicense(ctx);
  if (license) parts.push(`LICENSE ${license}`);
  if (ctx.data.secretary?.name) {
    parts.push(`SECRETARY: ${ctx.data.secretary.name.toUpperCase()}`);
  }
  if (ctx.data.show.entryCloseDate) {
    parts.push(`CLOSING: ${formatDate(ctx.data.show.entryCloseDate).toUpperCase()}`);
  }
  // Always emit something — a bare org+year keeps the strip from looking empty
  // for sparse fixtures.
  if (parts.length === 0) {
    parts.push(`${ctx.org} PREMIUM LIST`);
  }
  return parts.join(' · ');
}

function readLicense(ctx: CoverContext): string | null {
  // Optional — not declared on GeneratedPremium today; read defensively in case
  // richer fixtures pass one through.
  const candidate = (ctx.data as { licenseNumber?: unknown }).licenseNumber;
  if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  // Fall back to the first trial's eventNumber when no explicit license exists.
  const ev = ctx.data.trials?.[0]?.eventNumber;
  return ev ? ev : null;
}

interface ClosingDisplay {
  date: string;
  detail: string;
}

function composeClosing(entryCloseDate: string | null): ClosingDisplay {
  if (!entryCloseDate) return { date: 'TBD', detail: '' };
  return { date: formatDate(entryCloseDate), detail: '5:00 PM' };
}
