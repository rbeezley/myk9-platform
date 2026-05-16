// supabase/functions/send-confirmation-email/fieldGuide-email.ts
//
// Field Guide confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Field Guide palette + font stack. The
// canonical React-Email implementation lives in
// packages/email/src/templates/FieldGuideConfirmationEmail.tsx — keep
// these two in visual sync.
//
// Field Guide has no per-club brand color machinery — every show that
// selects this style gets the same parchment + indicator-orange palette.
// That keeps this builder simpler than `banner-email.ts` (no luminance
// derivation, no shifted siblings).
//
// Outlook safety: alternating-row backgrounds (paper-warm) work in
// modern email clients (Apple Mail, Gmail, Outlook 365) but render flat
// in Outlook 2007–2019. That's documented degradation.

const FG_PAPER = '#f6f1e6';
const FG_PAPER_WARM = '#ebe4cf';
const FG_PAPER_DEEP = '#1f2a24';
const FG_INK = '#1f2a24';
const FG_SOFT = '#3a4339';
const FG_MUTE = '#6b6e5e';
const FG_HAIR = '#c4bba0';
const FG_ORANGE = '#c96442';
const FG_ORANGE_DEEP = '#8a3e21';
const FG_DISPLAY = "'IBM Plex Sans', Arial, sans-serif";
const FG_BODY = "'IBM Plex Sans', Arial, sans-serif";
const FG_MONO = "'IBM Plex Mono', Courier, monospace";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface FieldGuideEmailData {
  /** Compact identifier — e.g. "BCKC.2026.SS". */
  showCode: string;
  clubName: string;
  clubCity: string | null;
  showTitle: string;
  dateRange: string;
  /** First-name salutation — Field Guide uses "Hi {first}" not "Dear ...". */
  salutation: string;
  dogName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: RunRow[];
  runCount: number;
  totalFeesFormatted: string;
  receiptNumber: string | null;
  /** Single armband to surface in the chip row (e.g. "247"). Null if not yet drawn. */
  armbandNumber: string | null;
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
  const headerCells = ['TRIAL', 'DAY', 'CLASS', 'JUDGE', '№']
    .map(
      (h, i) =>
        `<td style="padding:8px 12px;background:${FG_PAPER_WARM};border-bottom:1px solid ${FG_INK};font-family:${FG_MONO};font-weight:600;font-size:10px;letter-spacing:0.04em;color:${FG_MUTE};text-transform:uppercase;text-align:${i === 4 ? 'right' : 'left'};">${h}</td>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px solid ${FG_HAIR};`;
      const altBg = i % 2 === 1 ? `background:${FG_PAPER_WARM};` : '';
      return `<tr style="${altBg}">
  <td style="padding:10px 12px;${border}font-family:${FG_MONO};font-weight:600;font-size:13px;color:${FG_ORANGE_DEEP};">${esc(r.numeral)}</td>
  <td style="padding:10px 12px;${border}font-family:${FG_MONO};font-size:12px;color:${FG_INK};">${esc(r.dayLabel)}</td>
  <td style="padding:10px 12px;${border}font-family:${FG_BODY};font-size:13px;color:${FG_INK};">${esc(r.classLabel)}</td>
  <td style="padding:10px 12px;${border}font-family:${FG_BODY};font-size:13px;color:${FG_INK};">${esc(r.judgeName)}</td>
  <td style="padding:10px 12px;${border}font-family:${FG_DISPLAY};font-weight:700;font-size:16px;color:${FG_ORANGE_DEEP};text-align:right;">${r.armband ? esc(r.armband) : '—'}</td>
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
  <tr><td style="padding-bottom:12px;">
    <p style="margin:0;font-family:${FG_MONO};font-weight:500;font-size:10px;letter-spacing:0.04em;text-transform:uppercase;color:${FG_MUTE};">${esc(label)}</p>
    <p style="margin:4px 0 0;font-family:${FG_BODY};font-size:14px;line-height:1.55;color:${FG_SOFT};">${escMultiline(value)}</p>
  </td></tr>
</table>`;
}

export function buildFieldGuideHtml(data: FieldGuideEmailData): string {
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

  const armbandChip = data.armbandNumber
    ? ` · ARMBAND <strong style="color:${FG_ORANGE_DEEP};font-weight:600;">#${esc(data.armbandNumber)}</strong>`
    : '';

  const contactPieces: string[] = [
    'Draw is set. Refunds no longer available. Please notify the secretary if you cannot attend so we can release your slot',
  ];
  if (data.secretaryEmail) {
    contactPieces.push(
      ` — <a href="mailto:${esc(data.secretaryEmail)}" style="color:${FG_ORANGE_DEEP};text-decoration:none;font-weight:600;">${esc(data.secretaryEmail)}</a>`
    );
  }
  if (data.secretaryPhone) contactPieces.push(` · ${esc(data.secretaryPhone)}`);
  contactPieces.push('.');
  const contactLine = contactPieces.join('');

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td style="padding:28px 32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td bgcolor="${FG_ORANGE}" style="background:${FG_ORANGE};">
        <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:14px 28px;font-family:${FG_DISPLAY};font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:${FG_PAPER};text-decoration:none;">View trial particulars →</a>
      </td></tr>
    </table>
  </td>
</tr>`
    : '';

  const signatureBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:32px 32px 8px;font-family:${FG_BODY};font-size:14px;line-height:1.6;color:${FG_SOFT};">
    <p style="margin:0 0 14px;">See you ringside,</p>
    ${data.trialChairName ? `<p style="margin:0;font-family:${FG_DISPLAY};font-weight:700;font-size:18px;letter-spacing:-0.015em;color:${FG_INK};">${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:4px 0 0;font-family:${FG_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;color:${FG_ORANGE_DEEP};text-transform:uppercase;">${esc(data.trialChairTitle)}</p>` : ''}
  </td>
</tr>`
      : '';

  const dogLineBlock = dogLine
    ? `<tr><td style="padding:6px 0 16px;font-family:${FG_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;color:${FG_MUTE};text-transform:uppercase;">${esc(dogLine)}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(data.showTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#dcd5b9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#dcd5b9;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${FG_PAPER};">

  <!-- TOP ID BAR -->
  <tr>
    <td bgcolor="${FG_PAPER_DEEP}" style="background:${FG_PAPER_DEEP};color:${FG_PAPER};padding:10px 32px;font-family:${FG_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left"><span style="color:${FG_ORANGE};font-weight:600;">${esc(data.showCode)}</span> · CONFIRMATION · REV 01</td>
          <td align="right">${data.receiptNumber ? `RECEIPT ${esc(data.receiptNumber)}` : ''}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- HEADER -->
  <tr>
    <td style="padding:28px 32px 22px;border-bottom:2px solid ${FG_INK};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
        <tr>
          <td bgcolor="${FG_ORANGE}" style="background:${FG_ORANGE};color:${FG_PAPER};padding:3px 8px;font-family:${FG_MONO};font-weight:500;font-size:10px;letter-spacing:0.04em;">CONFIRMED</td>
          <td style="padding-left:8px;font-family:${FG_MONO};font-weight:500;font-size:10px;letter-spacing:0.04em;color:${FG_MUTE};">${data.runCount} ${data.runCount === 1 ? 'RUN' : 'RUNS'}${armbandChip}</td>
        </tr>
      </table>
      <h1 style="margin:0 0 10px;font-family:${FG_DISPLAY};font-weight:700;font-size:34px;letter-spacing:-0.025em;line-height:1.05;color:${FG_INK};">Entry confirmed.</h1>
      <p style="margin:0;font-family:${FG_MONO};font-weight:500;font-size:11px;letter-spacing:0.04em;color:${FG_ORANGE_DEEP};text-transform:uppercase;">${esc(data.showTitle)}${clubByline ? ` · ${esc(clubByline)}` : ''} · ${esc(data.dateRange)}</p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:24px 32px 8px;font-family:${FG_BODY};font-size:15px;line-height:1.6;color:${FG_SOFT};">
      <p style="margin:0;">Hi <strong style="color:${FG_INK};font-weight:600;">${esc(data.salutation)}</strong>,</p>
      <p style="margin:14px 0 0;">Entry recorded. Spec below — dog, runs, armband, on-the-day reference. Bring this email to check-in or write the number on a slip.</p>
    </td>
  </tr>

  <!-- §01 DETAIL CARD -->
  <tr>
    <td style="padding:24px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FG_INK};border-bottom:2px solid ${FG_INK};">
        <tr><td style="padding:14px 0 6px;font-family:${FG_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${FG_ORANGE_DEEP};">§01 · THE DOG</td></tr>
        <tr><td style="font-family:${FG_DISPLAY};font-weight:700;font-size:22px;letter-spacing:-0.02em;color:${FG_INK};line-height:1.15;">${esc(data.dogName)}</td></tr>
        ${dogLineBlock}
        <tr><td style="padding:8px 0 0;">${runsTable(data.runs)}</td></tr>
        <tr>
          <td style="padding:14px 0 16px;font-family:${FG_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${FG_INK};">
            ${data.runCount} ${data.runCount === 1 ? 'RUN' : 'RUNS'} · TOTAL <span style="color:${FG_ORANGE_DEEP};">${esc(data.totalFeesFormatted)}</span>${data.receiptNumber ? ` · RECEIPT ${esc(data.receiptNumber)}` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- §02 ON THE DAY -->
  <tr>
    <td style="padding:32px 32px 0;">
      <div style="font-family:${FG_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${FG_ORANGE_DEEP};margin-bottom:8px;">§02 · ON THE DAY</div>
      <h2 style="margin:0 0 24px;font-family:${FG_DISPLAY};font-weight:700;font-size:26px;letter-spacing:-0.02em;line-height:1.1;color:${FG_INK};">Be on site early.</h2>
      ${doorsBlock}${firstClassBlock}${venueBlock}${parkingBlock}${hospitalityBlock}${cratingBlock}
    </td>
  </tr>

  <!-- §03 WITHDRAW -->
  <tr>
    <td style="padding:32px 32px 0;">
      <div style="font-family:${FG_MONO};font-weight:600;font-size:11px;letter-spacing:0.04em;color:${FG_ORANGE_DEEP};margin-bottom:8px;">§03 · WITHDRAW</div>
      <p style="margin:0;font-family:${FG_BODY};font-size:14px;line-height:1.6;color:${FG_SOFT};">${contactLine}</p>
    </td>
  </tr>

  ${ctaBlock}
  ${signatureBlock}

  <!-- FOOTER (dark band) -->
  <tr>
    <td bgcolor="${FG_PAPER_DEEP}" style="background:${FG_PAPER_DEEP};color:${FG_PAPER};padding:28px 32px;">
      <div style="font-family:${FG_DISPLAY};font-weight:700;font-size:20px;letter-spacing:-0.015em;color:${FG_PAPER};margin-bottom:6px;">${esc(data.clubName)}</div>
      <div style="font-family:${FG_MONO};font-size:11px;letter-spacing:0.04em;color:rgba(246,241,230,0.7);margin-bottom:20px;">${esc(data.memberClubLanguage)}</div>
      <div style="font-family:${FG_MONO};font-size:9px;letter-spacing:0.04em;color:rgba(246,241,230,0.5);padding-top:18px;border-top:1px solid rgba(246,241,230,0.18);line-height:1.7;">YOU RECEIVED THIS BECAUSE YOU SUBMITTED AN ENTRY · ${esc(data.showCode)}</div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
