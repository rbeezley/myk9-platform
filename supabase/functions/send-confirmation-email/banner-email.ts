// supabase/functions/send-confirmation-email/banner-email.ts
//
// Banner confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Banner palette + font stack. The canonical
// React Email implementation lives in
// packages/email/src/templates/BannerConfirmationEmail.tsx — keep these
// two in visual sync.
//
// Per-club color: this module accepts `brandColor` on `BannerEmailData` and
// derives the deep / bright siblings + WCAG-luminance text color inline.
// The same algorithm lives in
// apps/myk9show/src/features/banner/hooks/useBannerBrandColor.ts —
// keep them in sync.
//
// Important: Outlook strips background-clip:text, color-mix(), and OKLCH —
// we never reach for any of those. The flag bar is a plain `bgcolor`
// attribute on a `<td>`, which renders correctly in every email client we
// care about.

const BN_PAPER = '#fafaf8';
const BN_INK = '#111111';
const BN_SOFT = '#2a2a2a';
const BN_MUTE = '#6b6b6b';
const BN_HAIR = '#d8d8d4';
const BN_DISPLAY = "'Inter Tight', Arial, sans-serif";
const BN_BODY = "'Inter', Arial, sans-serif";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface BannerEmailData {
  /** Raw hex from show.brand_color, e.g. "#0d4d4f". Sanitized inside this
   *  module — if the hex is malformed, we fall back to the default teal. */
  brandColor: string;
  clubName: string;
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
}

// ─── Color derivation (mirrors useBannerBrandColor in the web app) ──────────
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_FLAG = '#0d4d4f';

interface BrandColors {
  flag: string;
  flagDeep: string;
  flagBright: string;
  textOnFlag: '#ffffff' | '#111111';
}

function deriveBrandColors(input: string): BrandColors {
  const flag = HEX_RE.test(input) ? input : DEFAULT_FLAG;
  const { r, g, b } = hexToRgb(flag);
  return {
    flag,
    flagDeep: shiftLightness(flag, -0.45),
    flagBright: shiftLightness(flag, 0.35),
    textOnFlag: relativeLuminance(r, g, b) > 0.5 ? '#111111' : '#ffffff',
  };
}

function shiftLightness(hex: string, delta: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = delta >= 0 ? 255 : 0;
  const amount = Math.min(1, Math.abs(delta));
  const mix = (c: number) => Math.round(c + (target - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ─── HTML escape helpers ────────────────────────────────────────────────────
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escMultiline(s: string | null | undefined): string {
  return esc(s).replace(/\n/g, '<br/>');
}

// ─── Runs table ─────────────────────────────────────────────────────────────
function runsTable(runs: RunRow[], flag: string): string {
  const headerCells = ['Trial', 'Day', 'Class', 'Judge', 'Armband']
    .map(
      (h, i) =>
        `<td style="padding:8px 0;border-bottom:2px solid ${flag};font-family:${BN_BODY};font-weight:500;font-size:10px;letter-spacing:0.2em;color:${BN_MUTE};text-transform:uppercase;text-align:${i === 4 ? 'right' : 'left'};">${h}</td>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px solid ${BN_HAIR};`;
      return `<tr>
  <td style="padding:10px 0;${border}font-family:${BN_DISPLAY};font-weight:800;font-size:14px;letter-spacing:0.1em;color:${flag};">${esc(r.numeral)}</td>
  <td style="padding:10px 0;${border}font-family:${BN_BODY};font-size:13px;color:${BN_INK};">${esc(r.dayLabel)}</td>
  <td style="padding:10px 0;${border}font-family:${BN_BODY};font-size:13px;color:${BN_INK};">${esc(r.classLabel)}</td>
  <td style="padding:10px 0;${border}font-family:${BN_BODY};font-size:13px;color:${BN_INK};">${esc(r.judgeName)}</td>
  <td style="padding:10px 0;${border}font-family:${BN_DISPLAY};font-weight:800;font-size:18px;letter-spacing:-0.02em;color:${BN_INK};text-align:right;">${r.armband ? esc(r.armband) : '—'}</td>
</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>${headerCells}</tr>
  ${rows}
</table>`;
}

function infoCell(label: string, value: string | null): string {
  if (!value) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding-bottom:10px;">
    <p style="margin:0;font-family:${BN_BODY};font-weight:500;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${BN_MUTE};">${esc(label)}</p>
    <p style="margin:4px 0 0;font-family:${BN_BODY};font-size:14px;line-height:1.55;color:${BN_SOFT};">${escMultiline(value)}</p>
  </td></tr>
</table>`;
}

export function buildBannerHtml(data: BannerEmailData): string {
  const { flag, flagDeep, flagBright, textOnFlag } = deriveBrandColors(data.brandColor);

  const dogLine = [data.dogCallName ? `"${data.dogCallName}"` : null, data.dogBreed, data.dogSex]
    .filter(Boolean)
    .join(' · ');

  const clubByline = [data.clubCity].filter(Boolean).join(' · ');

  const venueBlock = infoCell('Venue', data.venue);
  const doorsBlock = infoCell('Doors open', data.doorsTime);
  const firstClassBlock = infoCell('First class', data.firstClassTime);
  const parkingBlock = infoCell('Parking', data.parkingNotes);
  const hospitalityBlock = infoCell('Hospitality', data.hospitalityNotes);
  const cratingBlock = infoCell('Crating', data.cratingNotes);

  const contactPieces: string[] = ['To withdraw or amend your entry, please contact the trial secretary'];
  if (data.secretaryEmail) {
    contactPieces.push(
      ` at <a href="mailto:${esc(data.secretaryEmail)}" style="color:${flag};text-decoration:none;">${esc(data.secretaryEmail)}</a>`
    );
  }
  if (data.secretaryPhone) contactPieces.push(` · ${esc(data.secretaryPhone)}`);
  contactPieces.push('.');
  const contactLine = contactPieces.join('');

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td align="left" style="padding:12px 36px 32px;">
    <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:14px 28px;background:${flag};color:${textOnFlag};font-family:${BN_DISPLAY};font-weight:700;font-size:13px;letter-spacing:0.04em;text-decoration:none;">View trial particulars</a>
  </td>
</tr>`
    : '';

  const signatureBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:0 36px 24px;font-family:${BN_BODY};font-size:13px;line-height:1.5;color:${BN_SOFT};">
    <p style="margin:0;">Best,</p>
    ${data.trialChairName ? `<p style="margin:6px 0 0;font-family:${BN_DISPLAY};font-weight:700;font-size:16px;color:${BN_INK};">${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:0;font-family:${BN_BODY};font-weight:500;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${BN_MUTE};">${esc(data.trialChairTitle)}</p>` : ''}
  </td>
</tr>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(data.showTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;700;800;900&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${BN_PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BN_PAPER};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${BN_PAPER};">

  <!-- FLAG MASTHEAD -->
  <tr>
    <td bgcolor="${flag}" style="padding:36px 36px 32px;background:${flag};color:${textOnFlag};">
      <p style="margin:0 0 14px;font-family:${BN_BODY};font-weight:500;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${textOnFlag};opacity:0.7;">Confirmed${data.receiptNumber ? ` · ${esc(data.receiptNumber)}` : ''}</p>
      <h1 style="margin:0;font-family:${BN_DISPLAY};font-weight:900;font-size:40px;letter-spacing:-0.04em;line-height:0.95;color:${textOnFlag};">You&apos;re in.</h1>
      <p style="margin:14px 0 0;font-family:${BN_BODY};font-size:14px;line-height:1.5;color:${textOnFlag};opacity:0.85;">
        ${esc(data.showTitle)}<br/>
        ${esc(data.clubName)}${clubByline ? ` · ${esc(clubByline)}` : ''} · ${esc(data.dateRange)}
      </p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:32px 36px 4px;font-family:${BN_BODY};font-size:15px;line-height:1.6;color:${BN_INK};">
      <p style="margin:0;">Dear ${esc(data.salutation)},</p>
      <p style="margin:12px 0 0;">Your entry is confirmed. The draw is set and your particulars are recorded below.</p>
    </td>
  </tr>

  <!-- ENTRY DETAIL CARD -->
  <tr>
    <td style="padding:20px 36px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${flag};border-bottom:2px solid ${flag};">
        <tr>
          <td style="padding:16px 0 8px;">
            <p style="margin:0;font-family:${BN_DISPLAY};font-weight:900;font-size:11px;letter-spacing:0.2em;color:${flag};">01 / THE DOG</p>
            <p style="margin:6px 0 0;font-family:${BN_DISPLAY};font-weight:800;font-size:24px;letter-spacing:-0.025em;line-height:1.1;color:${BN_INK};">${esc(data.dogName)}</p>
            ${dogLine ? `<p style="margin:6px 0 0;font-family:${BN_BODY};font-weight:500;font-size:12px;letter-spacing:0.08em;color:${BN_MUTE};">${esc(dogLine)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0 16px;">${runsTable(data.runs, flag)}</td>
        </tr>
        <tr>
          <td style="padding-bottom:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BN_HAIR};">
              <tr>
                <td style="padding-top:12px;font-family:${BN_BODY};font-weight:500;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${BN_MUTE};">${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'} · Fees received</td>
                <td style="padding-top:12px;font-family:${BN_DISPLAY};font-weight:900;font-size:28px;letter-spacing:-0.035em;color:${flag};text-align:right;">${esc(data.totalFeesFormatted)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ON THE DAY -->
  <tr>
    <td style="padding:0 36px 8px;">
      <h2 style="margin:8px 0 16px;font-family:${BN_DISPLAY};font-weight:800;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${flag};">02 / ON THE DAY</h2>
      ${doorsBlock}${firstClassBlock}${venueBlock}${parkingBlock}${hospitalityBlock}${cratingBlock}
    </td>
  </tr>

  <!-- WITHDRAW / CONTACT -->
  <tr>
    <td style="padding:12px 36px 8px;font-family:${BN_BODY};font-size:13px;line-height:1.6;color:${BN_SOFT};">
      <p style="margin:0;">${contactLine}</p>
    </td>
  </tr>

  ${ctaBlock}
  ${signatureBlock}

  <!-- FINAL FLAG BAND -->
  <tr>
    <td bgcolor="${flagDeep}" style="padding:32px 36px;background:${flagDeep};color:${BN_PAPER};">
      <p style="margin:0;font-family:${BN_DISPLAY};font-weight:900;font-size:22px;letter-spacing:-0.025em;line-height:1.15;color:${BN_PAPER};">See you <span style="color:${flagBright};">ringside</span>.</p>
      <p style="margin:10px 0 0;font-family:${BN_BODY};font-size:12px;line-height:1.5;color:${BN_PAPER};opacity:0.7;">${esc(data.memberClubLanguage)}</p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:16px 36px 24px;font-family:${BN_BODY};font-size:10px;letter-spacing:0.1em;color:${BN_MUTE};">
      You received this confirmation because you submitted an entry.
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
