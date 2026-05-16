// supabase/functions/send-confirmation-email/index.ts
//
// Styled confirmation email — sent on trials.confirmation_date via pg_cron.
// Called with { trial_id } or with no body (batch mode: process today's trials).
//
// Deploy: supabase functions deploy send-confirmation-email --no-verify-jwt
//
// Idempotent: tracks per-entry send state in entries.confirmation_email_* columns.
// The pg_cron job (migration 193) calls this at 09:00 UTC each day.

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { resolveEmailStyle, selectEmailBuilderKey } from './email-style-registry.ts';
import { buildHeadlineHtml } from './headline-email.ts';
import { buildMonogramHtml } from './monogram-email.ts';
import { buildBannerHtml } from './banner-email.ts';
import { buildFieldGuideHtml } from './fieldGuide-email.ts';
import { buildGazetteHtml } from './gazette-email.ts';
import { buildMagazineHtml } from './magazine-email.ts';
import { buildPosterHtml } from './poster-email.ts';
import { getPublishedExperienceHospitalityNotes } from './published-experience.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
// Shared secret for caller auth. Set HERITAGE_CONFIRMATION_SECRET in Supabase
// dashboard → Edge Functions → send-confirmation-email → Secrets. The pg_cron
// SQL (migration 193) must pass this value in the x-function-secret header.
// Without this env var the check is skipped (facilitates local dev / first deploy).
const FUNCTION_SECRET = Deno.env.get('HERITAGE_CONFIRMATION_SECRET');

// ─── Palette (must match packages/email/src/templates/HeritageConfirmationEmail.tsx) ──

const INK = '#1a1612';
const PAPER = '#f8f4ea';
const CLARET = '#8a1818';
const GOLD = '#8a6a45';
const QUILL = '#6b4f3a';
const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const BODY_FONT = "'EB Garamond', Georgia, serif";
// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Ornament rule — div line-trick required for Outlook (borders get stripped).
function ornamentRule(color = INK, lineWidth = 110): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td style="width:${lineWidth}px;vertical-align:middle;font-size:0;line-height:0;">
      <div style="width:${lineWidth}px;height:1px;background:${color};font-size:0;line-height:0;">&nbsp;</div>
    </td>
    <td style="padding:0 10px;font-family:${DISPLAY};font-size:18px;line-height:1;color:${CLARET};vertical-align:middle;">✦</td>
    <td style="width:${lineWidth}px;vertical-align:middle;font-size:0;line-height:0;">
      <div style="width:${lineWidth}px;height:1px;background:${color};font-size:0;line-height:0;">&nbsp;</div>
    </td>
  </tr>
</table>`;
}

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

function runsTable(runs: RunRow[]): string {
  const headerCells = ['Trial', 'Day', 'Class', 'Judge', 'Armband']
    .map(
      (h, i) =>
        `<td style="padding-bottom:6px;border-bottom:1px solid ${INK};font-family:${DISPLAY};font-style:italic;font-size:11px;color:${QUILL};letter-spacing:0.06em;text-transform:uppercase;${i === 4 ? 'text-align:right;' : ''}">${h}</td>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px dotted ${GOLD};`;
      return `<tr>
      <td style="padding:8px 0;${border}font-family:${DISPLAY};font-style:italic;color:${CLARET};font-size:14px;">${esc(r.numeral)}</td>
      <td style="padding:8px 0;${border}font-family:${BODY_FONT};font-size:13px;">${esc(r.dayLabel)}</td>
      <td style="padding:8px 0;${border}font-family:${BODY_FONT};font-size:13px;">${esc(r.classLabel)}</td>
      <td style="padding:8px 0;${border}font-family:${BODY_FONT};font-size:13px;">${esc(r.judgeName)}</td>
      <td style="padding:8px 0;${border}font-family:${DISPLAY};font-weight:500;font-size:16px;color:${INK};text-align:right;">${r.armband ? esc(r.armband) : '—'}</td>
    </tr>`;
    })
    .join('');

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
  <tr>${headerCells}</tr>
  ${rows}
</table>`;
}

// ─── Per-style derivation helpers ────────────────────────────────────────────
//
// Field Guide / Gazette / Magazine / Poster each carry one or two
// style-specific fields (showCode, editionLabel, showAbbreviation, etc.)
// that aren't in the shared emailData shape. We derive them here rather
// than make the dispatcher carry every per-style projection inline.
//
// These mirror the corresponding helpers on the app side
// (apps/myk9show/src/features/<style>/.../*) but Deno can't import from
// workspace packages, so the heuristics are duplicated. Keep them in
// loose visual parity — exact-match is not required since both sides
// derive from the same DB inputs.

const NOISE_WORDS = new Set([
  'the', 'and', 'of', 'at', 'a', 'an', 'for', 'in', 'on', 'to',
]);

/** Word-initials extractor used by deriveShowCode + deriveShowAbbreviation. */
function initialsOf(text: string, maxChars: number): string {
  const tokens = text
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !NOISE_WORDS.has(t.toLowerCase()));
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0].slice(0, maxChars).toUpperCase();
  return tokens.map(t => t[0]).join('').slice(0, maxChars).toUpperCase();
}

/** Compact ID for Field Guide top strip, e.g. "BCKC.2026.SS". Mirrors
 *  apps/myk9show/src/features/fieldGuide/landing/utils/showCode.ts. */
function deriveShowCode(clubName: string, showName: string, startDateIso: string | null): string {
  const club = initialsOf(clubName, 6);
  const show = initialsOf(showName, 2);
  const year = startDateIso
    ? String(new Date(startDateIso).getFullYear())
    : String(new Date().getFullYear());
  const parts = [club, year, show].filter(Boolean);
  return parts.length > 0 ? parts.join('.') : 'TRIAL';
}

/** Short show abbreviation for Poster's mono strip, e.g. "SS'26". */
function deriveShowAbbreviation(showName: string, startDateIso: string | null): string | null {
  const initials = initialsOf(showName, 2);
  if (!initials) return null;
  const year = startDateIso ? new Date(startDateIso).getFullYear() : new Date().getFullYear();
  return `${initials}'${String(year).slice(-2)}`;
}

/** Magazine kicker, e.g. "Vol I · Spring 2026". Derives a season from
 *  the start month and a roman volume from year - established year (or
 *  1 when established is unknown). Conservative default. */
function deriveMagazineEditionLabel(startDateIso: string | null): string {
  const date = startDateIso ? new Date(startDateIso) : new Date();
  const month = date.getMonth(); // 0-11
  const season =
    month <= 1 || month === 11 ? 'Winter' :
    month <= 4 ? 'Spring' :
    month <= 7 ? 'Summer' : 'Autumn';
  return `${season} ${date.getFullYear()}`;
}

/** Gazette edition strip, e.g. "VOL LXXIX · NO 47". Optional — return
 *  null to suppress (per the Gazette README §Open Questions Q5, Outlook
 *  renders the strip poorly). Null until we ship a real edition source. */
function deriveGazetteEditionLabel(): string | null {
  return null;
}

function buildHtml(data: {
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  dateRange: string;
  salutation: string;
  dogName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: RunRow[];
  runCount: number;
  totalFeesFormatted: string;
  receiptNumber: string | null;
  venue: string | null;
  doorsTime: string | null;
  firstClassTime: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;
  secretaryEmail: string | null;
  secretaryPhone: string | null;
  trialUrl: string | null;
  trialChairName: string | null;
  trialChairTitle: string | null;
  memberClubLanguage: string;
}): string {
  const dogLine = [
    data.dogCallName ? `called &ldquo;${esc(data.dogCallName)}&rdquo;` : null,
    data.dogBreed ? esc(data.dogBreed) : null,
    data.dogSex ? esc(data.dogSex) : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  const onTheDaySection =
    data.doorsTime ||
    data.firstClassTime ||
    data.venue ||
    data.parkingNotes ||
    data.hospitalityNotes ||
    data.cratingNotes
      ? `
<tr>
  <td style="padding:24px 48px 8px;">
    <p style="margin:0;text-align:center;font-family:${DISPLAY};font-style:italic;font-size:13px;color:${CLARET};letter-spacing:0.04em;">§ On the Day</p>
    <h2 style="margin:4px 0 16px;text-align:center;font-family:${DISPLAY};font-style:italic;font-weight:500;font-size:26px;color:${INK};">What to expect</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="width:50%;padding:6px 12px 6px 0;vertical-align:top;font-family:${BODY_FONT};font-size:13px;line-height:1.55;">
          ${data.doorsTime ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">Doors</p><p style="margin:2px 0 10px;color:${INK};">${esc(data.doorsTime)}</p>` : ''}
          ${data.firstClassTime ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">First class</p><p style="margin:2px 0 10px;color:${INK};">${esc(data.firstClassTime)}</p>` : ''}
          ${data.cratingNotes ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">Crating</p><p style="margin:2px 0;color:${INK};">${esc(data.cratingNotes)}</p>` : ''}
        </td>
        <td style="width:50%;padding:6px 0 6px 12px;vertical-align:top;font-family:${BODY_FONT};font-size:13px;line-height:1.55;">
          ${data.venue ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">Venue</p><p style="margin:2px 0 10px;color:${INK};">${esc(data.venue).replace(/\n/g, '<br/>')}</p>` : ''}
          ${data.parkingNotes ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">Parking</p><p style="margin:2px 0 10px;color:${INK};">${esc(data.parkingNotes)}</p>` : ''}
          ${data.hospitalityNotes ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;color:${QUILL};font-size:12px;">Hospitality</p><p style="margin:2px 0;color:${INK};">${esc(data.hospitalityNotes)}</p>` : ''}
        </td>
      </tr>
    </table>
    ${data.runs[0]?.armband ? `<p style="margin:18px 0 0;padding:12px 16px;background:rgba(138,106,69,0.08);border-left:2px solid ${GOLD};border-right:2px solid ${GOLD};font-family:${BODY_FONT};font-size:12.5px;line-height:1.55;color:${INK};"><em style="font-family:${DISPLAY};font-style:italic;color:${CLARET};">Please bring</em> your AKC registration confirmation, vaccination records, and a copy of this email. Armband <strong style="font-family:${DISPLAY};font-weight:500;">${esc(data.runs[0].armband)}</strong> will be issued at check-in.</p>` : ''}
  </td>
</tr>`
      : '';

  const signatureSection =
    data.trialChairName || data.trialChairTitle
      ? `
<tr>
  <td style="padding:0 56px 28px;font-family:${BODY_FONT};font-size:14px;line-height:1.55;color:${INK};">
    <p style="margin:0 0 6px;">We look forward to seeing you and ${data.dogCallName ? `<em>${esc(data.dogCallName)}</em>` : esc(data.dogName)} at the trial.</p>
    ${data.trialChairName ? `<p style="margin:0;font-family:${DISPLAY};font-style:italic;font-size:18px;color:${INK};">— ${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:0;font-family:${BODY_FONT};font-size:12px;color:${QUILL};font-style:italic;">${esc(data.trialChairTitle)}</p>` : ''}
  </td>
</tr>`
      : '';

  const ctaSection = data.trialUrl
    ? `
<tr>
  <td align="center" style="padding:16px 48px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${INK};padding:12px 28px;">
          <a href="${esc(data.trialUrl)}" style="font-family:${DISPLAY};font-style:italic;font-size:15px;color:${PAPER};text-decoration:none;letter-spacing:0.06em;">View trial particulars ›</a>
        </td>
      </tr>
    </table>
    <p style="margin:14px 0 0;font-family:${DISPLAY};font-style:italic;font-size:11px;color:${QUILL};">Add to calendar · directions · order of running</p>
  </td>
</tr>`
    : '';

  const contactLine = data.secretaryEmail
    ? `<a href="mailto:${esc(data.secretaryEmail)}" style="color:${CLARET};text-decoration:none;">${esc(data.secretaryEmail)}</a>`
    : 'the Trial Secretary';
  const phonePart = data.secretaryPhone ? ` or telephone ${esc(data.secretaryPhone)}` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&amp;display=swap" rel="stylesheet"/>
<title>Entry Confirmation · ${esc(data.showTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#d9d2c2;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#d9d2c2;padding:32px 0;">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${PAPER};">

  <!-- HEADER -->
  <tr>
    <td style="padding:36px 48px 12px;text-align:center;">
      <p style="margin:0;font-family:${DISPLAY};font-style:italic;font-size:13px;color:${QUILL};letter-spacing:0.04em;">A formal confirmation from</p>
      <p style="margin:4px 0 2px;font-family:${DISPLAY};font-weight:600;font-size:18px;text-transform:uppercase;letter-spacing:0.18em;color:${INK};">${esc(data.clubName)}</p>
      ${data.clubEstablished || data.clubCity ? `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-style:italic;font-size:11px;color:${QUILL};">${[data.clubEstablished, data.clubCity].filter(Boolean).map(esc).join(' &middot; ')}</p>` : ''}
      ${ornamentRule(INK, 110)}
      <h1 style="margin:12px 0 4px;font-family:${DISPLAY};font-weight:500;font-style:italic;font-size:38px;line-height:1.05;color:${INK};">Your entry is <em style="color:${CLARET};font-style:italic;">confirmed</em>.</h1>
      <p style="margin:8px 0 0;font-family:${BODY_FONT};font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:${QUILL};">${esc(data.showTitle)} &middot; ${esc(data.dateRange)}</p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:18px 56px 6px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${INK};">
      <p style="margin:0 0 12px;">Dear <em style="font-family:${DISPLAY};font-style:italic;color:${CLARET};">${esc(data.salutation)}</em>,</p>
      <p style="margin:0 0 12px;">We have the pleasure of confirming your entry to the <em style="font-family:${DISPLAY};font-style:italic;">${esc(data.showTitle)}</em>. The draw has been completed and the running order is set; your particulars are recorded as follows.</p>
    </td>
  </tr>

  <!-- ENTRY DETAIL CARD -->
  <tr>
    <td style="padding:12px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};padding:18px 0;">
        <tr>
          <td style="padding:14px 8px;">
            <p style="margin:0;font-family:${DISPLAY};font-style:italic;font-size:13px;color:${CLARET};letter-spacing:0.06em;">§ The Dog</p>
            <p style="margin:4px 0 2px;font-family:${DISPLAY};font-size:24px;font-weight:500;line-height:1.15;color:${INK};">${esc(data.dogName)}</p>
            ${dogLine ? `<p style="margin:0 0 14px;font-family:${BODY_FONT};font-style:italic;font-size:13px;color:${QUILL};">${dogLine}</p>` : ''}
            ${runsTable(data.runs)}
            <p style="margin:16px 0 0;font-family:${BODY_FONT};font-size:12px;color:${QUILL};line-height:1.55;">
              <em style="font-family:${DISPLAY};font-style:italic;">${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'} entered.</em>
              Total fees received: <span style="color:${INK};">${esc(data.totalFeesFormatted)}</span>${data.receiptNumber ? `. Receipt #${esc(data.receiptNumber)}.` : '.'}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${onTheDaySection}

  <!-- ORNAMENT DIVIDER -->
  <tr>
    <td style="padding:24px 48px 8px;" align="center">
      ${ornamentRule(GOLD, 90)}
    </td>
  </tr>

  <!-- WITHDRAW / CONTACT -->
  <tr>
    <td style="padding:4px 56px 12px;font-family:${BODY_FONT};font-size:13.5px;line-height:1.6;color:${INK};">
      <p style="margin:0 0 10px;text-align:center;font-family:${DISPLAY};font-style:italic;font-size:13px;color:${CLARET};letter-spacing:0.04em;">§ If you must withdraw</p>
      <p style="margin:0 0 10px;">Should circumstances prevent your attendance, kindly notify the Trial Secretary in writing. Refunds (less $5 processing) are issued for written withdrawals received before closing; entries withdrawn after closing cannot be refunded but the slot will be released to the wait list.</p>
      <p style="margin:0;">For any other matter, please write to ${contactLine}${phonePart}.</p>
    </td>
  </tr>

  ${ctaSection}
  ${signatureSection}

  <!-- FOOTER -->
  <tr>
    <td style="background:${INK};padding:24px 48px;text-align:center;">
      <p style="margin:0;font-family:${DISPLAY};font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:0.18em;color:${PAPER};">${esc(data.clubName)}</p>
      <p style="margin:4px 0 0;font-family:${BODY_FONT};font-style:italic;font-size:11px;color:rgba(248,244,234,0.7);">${esc(data.memberClubLanguage)}</p>
      <p style="margin:16px 0 0;font-family:${BODY_FONT};font-size:10.5px;line-height:1.55;color:rgba(248,244,234,0.55);">You received this confirmation because you submitted an entry.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Database helpers ─────────────────────────────────────────────────────────

function formatTrialDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const month = s.toLocaleDateString('en-US', { month: 'long' });
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${month} ${s.getFullYear()}`
    : `${s.getDate()} ${month} – ${e.getDate()} ${e.toLocaleDateString('en-US', { month: 'long' })} ${e.getFullYear()}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://myk9-platform-myk9show.vercel.app',
  'https://myk9show.com',
  'http://localhost:5173',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Caller auth: when HERITAGE_CONFIRMATION_SECRET is configured, every
  // non-OPTIONS request must carry it in x-function-secret. The pg_cron
  // SQL in migration 193 must be updated to pass this header.
  if (FUNCTION_SECRET) {
    const provided = req.headers.get('x-function-secret');
    if (provided !== FUNCTION_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 503,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Determine which trials to process.
    // Body is optional — called with { trial_id } for a single trial,
    // or with no body (pg_cron batch mode) to process all trials whose
    // confirmation_date = today.
    let trialIds: string[] = [];

    if (req.method === 'POST' && req.headers.get('content-length') !== '0') {
      const body = (await req.json().catch(() => ({}))) as { trial_id?: string };
      if (body.trial_id) {
        trialIds = [body.trial_id];
      }
    }

    if (trialIds.length === 0) {
      // Batch: find trials whose confirmation_date is today (UTC)
      const today = new Date().toISOString().slice(0, 10);
      const { data: trials } = await supabase
        .from('trials')
        .select('id')
        .gte('confirmation_date', `${today}T00:00:00Z`)
        .lt('confirmation_date', `${today}T23:59:59Z`);
      trialIds = (trials ?? []).map((t: { id: string }) => t.id);
    }

    if (trialIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, failed: 0, message: 'No trials due today' }),
        {
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    let sent = 0,
      skipped = 0,
      failed = 0;

    for (const trialId of trialIds) {
      // Load trial + show + club
      const { data: trial } = await supabase
        .from('trials')
        .select('id, date, trial_number, display_order, show_id, name')
        .eq('id', trialId)
        .single();

      if (!trial) continue;

      const { data: show } = await supabase
        .from('shows')
        .select(
          'id, name, start_date, end_date, venue_name, city, state, address, organization, club_id, style, experience_is_published, experience_published_style, experience_published_content'
        )
        .eq('id', trial.show_id)
        .single();

      if (!show) continue;

      // All trials for this show (for numeral resolution)
      const { data: allTrials } = await supabase
        .from('trials')
        .select('id, date, trial_number, display_order')
        .eq('show_id', show.id)
        .order('display_order', { ascending: true });

      // Judges for this trial
      const { data: judgeAssignments } = await supabase
        .from('judge_assignments')
        .select('trial_id, person:people(first_name, last_name)')
        .eq('trial_id', trialId);

      const judges = (judgeAssignments ?? []).map(
        (j: { trial_id: string; person: { first_name?: string; last_name?: string } | null }) => ({
          trial_id: j.trial_id,
          judgeName: j.person
            ? [j.person.first_name, j.person.last_name].filter(Boolean).join(' ')
            : '—',
        })
      );

      // Build trial numeral map
      const sortedTrials = [...(allTrials ?? [])].sort(
        (a: { display_order?: number | null }, b: { display_order?: number | null }) =>
          (a.display_order ?? 999) - (b.display_order ?? 999)
      );
      const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      const numeralMap = new Map(
        sortedTrials.map((t: { id: string; trial_number?: string | null }, i: number) => [
          t.id,
          t.trial_number ?? ROMAN[i] ?? String(i + 1),
        ])
      );

      // Entries not yet sent for this trial
      const { data: entries } = await supabase
        .from('entries')
        .select(
          `
          id, armband, entry_fee, trial_id, class_id,
          dog:dogs(name, call_name, breed, sex),
          handler:people(first_name, last_name, email),
          class:classes(name, level, element)
        `
        )
        .eq('trial_id', trialId)
        .in('confirmation_email_status', ['pending', 'failed']);

      for (const entry of entries ?? []) {
        const recipientEmail = entry.handler?.email;
        if (!recipientEmail) {
          skipped++;
          continue;
        }

        const dogName = entry.dog?.name ?? 'Unknown Dog';
        const salutation =
          [entry.handler?.first_name, entry.handler?.last_name].filter(Boolean).join(' ') ||
          'Exhibitor';

        const classLabel =
          [entry.class?.level, entry.class?.element ?? entry.class?.name]
            .filter(Boolean)
            .join(' · ') || '—';

        const judge = judges.find((j: { trial_id: string }) => j.trial_id === trialId);

        const runRow: RunRow = {
          numeral: numeralMap.get(trialId) ?? '—',
          dayLabel: formatTrialDay(trial.date),
          classLabel,
          judgeName: judge?.judgeName ?? '—',
          armband: entry.armband ?? null,
        };

        const venueStr =
          [show.venue_name, [show.address, show.city, show.state].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join('\n') || null;

        const emailData: Parameters<typeof buildHtml>[0] = {
          clubName: show.name,
          clubEstablished: null,
          clubCity: [show.city, show.state].filter(Boolean).join(', ') || null,
          showTitle: show.name,
          dateRange: formatDateRange(show.start_date, show.end_date),
          salutation,
          dogName,
          dogCallName: entry.dog?.call_name ?? null,
          dogBreed: entry.dog?.breed ?? null,
          dogSex: entry.dog?.sex ?? null,
          runs: [runRow],
          runCount: 1,
          totalFeesFormatted: entry.entry_fee ? `$${(entry.entry_fee / 100).toFixed(2)}` : '—',
          receiptNumber: null,
          venue: venueStr,
          doorsTime: null,
          firstClassTime: null,
          parkingNotes: null,
          hospitalityNotes: getPublishedExperienceHospitalityNotes(show),
          cratingNotes: null,
          secretaryEmail: null,
          secretaryPhone: null,
          trialUrl: null,
          trialChairName: null,
          trialChairTitle: null,
          memberClubLanguage: 'A member club of the American Kennel Club',
        };
        const showStyle = resolveEmailStyle(show.experience_published_style ?? show.style);
        const emailBuilder = selectEmailBuilderKey(showStyle);

        // Mirrors apps/myk9show/src/features/monogram/utils/buildMonogram.ts
        // (canonical app-side helper) and the older premium/pdf/pdfStyles.ts
        // helper. Inline here because Deno edge functions cannot import from
        // workspace packages. Keep the three copies semantically aligned.
        const monogramLetters =
          (emailData.clubName || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .map(w => w[0]!.toUpperCase())
            .join('') || '?';

        // Single armband across all runs for this entry (the dispatcher
        // is per-entry per-trial with a single run in scope, so all four
        // sibling styles that take a top-level armband field share the
        // same value).
        const primaryArmband = emailData.runs[0]?.armband ?? null;

        let html: string;
        if (emailBuilder === 'headline') {
          html = buildHeadlineHtml(emailData);
        } else if (emailBuilder === 'monogram') {
          html = buildMonogramHtml({ ...emailData, monogramLetters });
        } else if (emailBuilder === 'banner') {
          // Migration 20260515212527 added shows.brand_color with a
          // NOT NULL default, so rows should always have a value. The
          // builder still validates the hex and falls back to deep teal
          // defensively.
          const brandColor = (show as Record<string, unknown>).brand_color;
          html = buildBannerHtml({
            ...emailData,
            brandColor: typeof brandColor === 'string' ? brandColor : '#0d4d4f',
          });
        } else if (emailBuilder === 'fieldGuide') {
          // armbandNumber is optional — Field Guide's builder derives it
          // from runs when omitted. We pass it through explicitly so the
          // chip surfaces with the same value as the data row.
          html = buildFieldGuideHtml({
            ...emailData,
            showCode: deriveShowCode(emailData.clubName, emailData.showTitle, show.start_date),
            armbandNumber: primaryArmband,
          });
        } else if (emailBuilder === 'gazette') {
          html = buildGazetteHtml({
            ...emailData,
            editionLabel: deriveGazetteEditionLabel(),
          });
        } else if (emailBuilder === 'magazine') {
          html = buildMagazineHtml({
            ...emailData,
            editionLabel: deriveMagazineEditionLabel(show.start_date),
            primaryArmband,
            // No license-reference column yet — leave the footer line off
            // until a `shows.license_reference` field lands.
            licenseReference: null,
          });
        } else if (emailBuilder === 'poster') {
          html = buildPosterHtml({
            ...emailData,
            showAbbreviation: deriveShowAbbreviation(emailData.showTitle, show.start_date),
            armband: primaryArmband,
            // Constant for now — every supported show is AKC-licensed.
            // Promote to a column read once non-AKC trials land.
            licenseLanguage: 'An AKC Licensed Trial',
          });
        } else {
          html = buildHtml(emailData);
        }

        // Mark pending before send (prevents double-sends on retry)
        await supabase
          .from('entries')
          .update({ confirmation_email_status: 'pending' })
          .eq('id', entry.id);

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Idempotency-Key': `${showStyle}-confirm-${entry.id}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: recipientEmail,
            subject: `Your entry to ${show.name} is confirmed`,
            html,
          }),
        });

        if (resendRes.ok) {
          const result = (await resendRes.json()) as { id: string };
          await supabase
            .from('entries')
            .update({
              confirmation_email_sent_at: new Date().toISOString(),
              confirmation_email_message_id: result.id,
              confirmation_email_status: 'sent',
            })
            .eq('id', entry.id);
          sent++;
        } else {
          const err = (await resendRes.json()) as { message?: string };
          console.error(`Failed to send to ${recipientEmail}:`, err);
          await supabase
            .from('entries')
            .update({
              confirmation_email_status: 'failed',
            })
            .eq('id', entry.id);
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({ sent, skipped, failed }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-confirmation-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
