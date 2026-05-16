// supabase/functions/send-confirmation-email/poster-email.ts
//
// Poster confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Poster palette + font stack. The canonical
// React Email implementation lives in
// packages/email/src/templates/PosterConfirmationEmail.tsx — keep these
// two in visual sync.
//
// Important — Outlook degradation:
//   - `mix-blend-mode` is unsupported. The Poster ink-blot graphic shape
//     is intentionally OMITTED from this email — the red mono strip at
//     the top carries the visual register instead.
//   - `background-clip:text` and `-webkit-text-stroke` (the outline-text
//     trick used on the web landing) are also unsupported. We never
//     reach for either; emphasis comes from solid `color: ${RED}`.
//   - The display font stack lists Archivo Black first with Inter Tight
//     as the immediate fallback. Clients that strip the Google Fonts
//     <link> render Inter Tight 800/900, which still carries the heavy
//     condensed character.

const PO_CREAM = '#f3ede0';
const PO_INK = '#1f1d18';
const PO_INK_SOFT = '#3a342a';
const PO_MUTE = '#7a7466';
const PO_HAIR = '#cabe9f';
const PO_RED = '#c83b1a';
const PO_DISPLAY = "'Archivo Black','Inter Tight', Arial, sans-serif";
const PO_DISPLAY_TIGHT = "'Inter Tight', Arial, sans-serif";
const PO_BODY = "'Inter', Arial, sans-serif";
const PO_MONO = "'IBM Plex Mono', Courier, monospace";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface PosterEmailData {
  clubName: string;
  clubCity: string | null;
  showTitle: string;
  /** Show abbreviation, e.g. "SS'26". Used in the top mono strip. */
  showAbbreviation: string | null;
  dateRange: string;
  salutation: string;
  /** Primary armband for the headline. May be null when not yet assigned. */
  armband: string | null;
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
  licenseLanguage: string;
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
function runsTable(runs: RunRow[]): string {
  const headerCells = ['Trial', 'Day', 'Class', 'Judge', '№']
    .map(
      (h, i) =>
        `<td style="padding:8px 0;border-bottom:1px solid ${PO_HAIR};font-family:${PO_MONO};font-weight:600;font-size:10px;letter-spacing:0.04em;color:${PO_MUTE};text-transform:uppercase;text-align:${i === 4 ? 'right' : 'left'};">${h}</td>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px solid ${PO_HAIR};`;
      return `<tr>
  <td style="padding:12px 0;${border}font-family:${PO_DISPLAY};font-size:18px;letter-spacing:-0.03em;color:${PO_RED};">${esc(r.numeral)}</td>
  <td style="padding:12px 8px;${border}font-family:${PO_DISPLAY_TIGHT};font-weight:700;font-size:13px;color:${PO_INK};">${esc(r.dayLabel)}</td>
  <td style="padding:12px 8px;${border}font-family:${PO_DISPLAY_TIGHT};font-weight:700;font-size:13px;color:${PO_INK};">${esc(r.classLabel)}</td>
  <td style="padding:12px 8px;${border}font-family:${PO_BODY};font-size:13px;color:${PO_INK};">${esc(r.judgeName)}</td>
  <td style="padding:12px 0 12px 8px;${border}font-family:${PO_DISPLAY};font-size:20px;letter-spacing:-0.03em;color:${PO_RED};text-align:right;">${r.armband ? esc(r.armband) : '—'}</td>
</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>${headerCells}</tr>
  ${rows}
</table>`;
}

function dayCell(label: string, value: string | null): string {
  if (!value) return '';
  return `<td width="50%" style="padding:14px 16px;border-right:1px solid rgba(243,237,224,0.18);border-bottom:1px solid rgba(243,237,224,0.18);vertical-align:top;">
  <div style="font-family:${PO_MONO};font-weight:600;font-size:10px;letter-spacing:0.04em;color:rgba(243,237,224,0.6);margin-bottom:4px;text-transform:uppercase;">${esc(label)}</div>
  <div style="font-family:${PO_DISPLAY};font-size:22px;letter-spacing:-0.03em;color:${PO_CREAM};">${escMultiline(value)}</div>
</td>`;
}

function dayRow(left: { label: string; value: string | null }, right: { label: string; value: string | null }): string {
  if (!left.value && !right.value) return '';
  const leftCell = left.value ? dayCell(left.label, left.value) : `<td width="50%" style="padding:14px 16px;border-right:1px solid rgba(243,237,224,0.18);border-bottom:1px solid rgba(243,237,224,0.18);"></td>`;
  const rightCell = right.value ? dayCell(right.label, right.value) : `<td width="50%" style="padding:14px 16px;border-bottom:1px solid rgba(243,237,224,0.18);"></td>`;
  return `<tr>${leftCell}${rightCell}</tr>`;
}

export function buildPosterHtml(data: PosterEmailData): string {
  const dogLine = [data.dogCallName ? `"${data.dogCallName}"` : null, data.dogBreed, data.dogSex]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();

  const onTheDayBlock =
    data.doorsTime ||
    data.firstClassTime ||
    data.venue ||
    data.parkingNotes ||
    data.hospitalityNotes ||
    data.cratingNotes
      ? `<tr>
  <td style="padding:36px 32px 0;">
    <div style="font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_RED};margin-bottom:10px;">NO 03 / ON THE DAY</div>
    <h2 style="margin:0 0 24px;font-family:${PO_DISPLAY};font-size:36px;letter-spacing:-0.04em;line-height:0.9;color:${PO_INK};">
      ${data.firstClassTime ? `Be on site by <span style="color:${PO_RED};">${esc(data.firstClassTime.split(/\s+/)[0]!)}.</span>` : `Doors <span style="color:${PO_RED};">open.</span>`}
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PO_INK}" style="background:${PO_INK};color:${PO_CREAM};">
      ${dayRow({ label: 'Doors', value: data.doorsTime }, { label: 'First class', value: data.firstClassTime })}
      ${dayRow({ label: 'Crating', value: data.cratingNotes }, { label: 'Parking', value: data.parkingNotes })}
      ${dayRow({ label: 'Hospitality', value: data.hospitalityNotes }, { label: 'Venue', value: data.venue })}
    </table>
  </td>
</tr>`
      : '';

  const withdrawBlock = data.secretaryEmail
    ? `<tr>
  <td style="padding:36px 32px 0;">
    <div style="font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_RED};margin-bottom:10px;">NO 04 / IF YOU MUST WITHDRAW</div>
    <p style="margin:0;font-family:${PO_BODY};font-size:15px;line-height:1.65;color:${PO_INK_SOFT};">Please notify the secretary as soon as possible if you cannot attend, so we can release your slot. Email <a href="mailto:${esc(data.secretaryEmail)}" style="color:${PO_RED};font-weight:600;text-decoration:none;">${esc(data.secretaryEmail)}</a>${data.secretaryPhone ? ` · ${esc(data.secretaryPhone)}` : ''}.</p>
  </td>
</tr>`
    : '';

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td style="padding:28px 32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td bgcolor="${PO_RED}" style="background:${PO_RED};">
        <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:18px 32px;font-family:${PO_DISPLAY};font-size:18px;letter-spacing:-0.02em;color:${PO_CREAM};text-decoration:none;">VIEW TRIAL PARTICULARS →</a>
      </td></tr>
    </table>
  </td>
</tr>`
    : '';

  const signoffBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:36px 32px 8px;font-family:${PO_BODY};font-size:15px;line-height:1.65;color:${PO_INK_SOFT};">
    <p style="margin:0 0 18px;">See you on trial day,</p>
    ${data.trialChairName ? `<p style="margin:0;font-family:${PO_DISPLAY};font-size:24px;letter-spacing:-0.035em;color:${PO_INK};">${esc(data.trialChairName.toUpperCase())}.</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:6px 0 0;font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_RED};">${esc(data.trialChairTitle.toUpperCase())}</p>` : ''}
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
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter+Tight:wght@500;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${PO_CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PO_CREAM};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${PO_CREAM};">

  <!-- TOP MONO STRIP -->
  <tr>
    <td bgcolor="${PO_INK}" style="background:${PO_INK};color:${PO_CREAM};padding:10px 32px;font-family:${PO_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left">CONFIRMED <span style="color:${PO_RED};">●</span> ${esc((data.showAbbreviation ?? 'TRIAL').toUpperCase())}</td>
          ${data.trialUrl ? `<td align="right"><a href="${esc(data.trialUrl)}" style="color:${PO_CREAM};text-decoration:none;">VIEW IN BROWSER</a></td>` : '<td></td>'}
        </tr>
      </table>
    </td>
  </tr>

  <!-- HERO HEADLINE -->
  <tr>
    <td style="padding:36px 32px 24px;border-bottom:2px solid ${PO_INK};">
      <div style="font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_RED};margin-bottom:16px;">NO 01 / CONFIRMATION</div>
      <h1 style="margin:0 0 14px;font-family:${PO_DISPLAY};font-size:48px;letter-spacing:-0.045em;line-height:0.85;color:${PO_INK};">
        You&apos;re <span style="color:${PO_RED};">in.</span>${data.armband ? `<br/>Armband <span style="color:${PO_RED};">${esc(data.armband)}.</span>` : ''}
      </h1>
      <p style="margin:0;font-family:${PO_DISPLAY_TIGHT};font-weight:800;font-size:16px;letter-spacing:-0.01em;line-height:1.4;color:${PO_INK_SOFT};">
        ${esc(data.showTitle)} · ${esc(data.dateRange)}${data.clubCity ? ` · ${esc(data.clubCity)}` : ''}
      </p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:28px 32px 8px;font-family:${PO_BODY};font-size:16px;line-height:1.65;color:${PO_INK_SOFT};">
      <p style="margin:0 0 14px;">Hi <strong style="color:${PO_INK};">${esc(data.salutation)}</strong>,</p>
      <p style="margin:0;">Your entry is recorded. Below: the dog, the runs${data.armband ? ', the armband' : ''}. See you on trial day.</p>
    </td>
  </tr>

  <!-- DETAIL CARD -->
  <tr>
    <td style="padding:28px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${PO_INK};border-bottom:2px solid ${PO_INK};">
        <tr><td style="padding:18px 0 8px;font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_RED};">NO 02 / THE DOG</td></tr>
        <tr><td style="font-family:${PO_DISPLAY};font-size:26px;letter-spacing:-0.035em;color:${PO_INK};line-height:0.95;">${esc(data.dogName.toUpperCase())}</td></tr>
        ${dogLine ? `<tr><td style="padding:10px 0 18px;font-family:${PO_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;color:${PO_MUTE};">${esc(dogLine)}</td></tr>` : ''}
        <tr><td style="padding:8px 0 0;border-top:1px solid ${PO_HAIR};">${runsTable(data.runs)}</td></tr>
        <tr><td style="padding:14px 0 18px;border-top:1px solid ${PO_HAIR};">
          <span style="font-family:${PO_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${PO_INK};">${data.runCount} ${data.runCount === 1 ? 'RUN' : 'RUNS'} · TOTAL ${esc(data.totalFeesFormatted)}${data.receiptNumber ? ` · RECEIPT ${esc(data.receiptNumber)}` : ''}</span>
        </td></tr>
      </table>
    </td>
  </tr>

  ${onTheDayBlock}
  ${withdrawBlock}
  ${ctaBlock}
  ${signoffBlock}

  <!-- FOOTER -->
  <tr>
    <td bgcolor="${PO_INK}" style="padding:36px 32px;background:${PO_INK};color:${PO_CREAM};">
      <div style="font-family:${PO_DISPLAY};font-size:24px;letter-spacing:-0.03em;color:${PO_CREAM};margin-bottom:6px;">${esc((data.clubName || 'Kennel Club').toUpperCase())}.</div>
      <div style="font-family:${PO_MONO};font-size:11px;letter-spacing:0.04em;color:rgba(243,237,224,0.65);margin-bottom:24px;">${esc(data.memberClubLanguage)}</div>
      <div style="font-family:${PO_MONO};font-size:10px;letter-spacing:0.04em;color:rgba(243,237,224,0.5);padding-top:18px;border-top:1px solid rgba(243,237,224,0.18);line-height:1.7;">
        You received this confirmation because you submitted an entry.<br/>
        ${esc(data.licenseLanguage)}
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
