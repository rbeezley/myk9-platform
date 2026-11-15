// The Heritage confirmation template (the default style's builder), moved out of index.ts.
// Deno-free so vitest can import it.

import { esc } from './confirmation-email-shared.ts';
import { renderVenueMapBlock, type VenueMapAssets } from './venue-directions.ts';

// ─── Production Heritage email palette (owned by this builder) ──

const INK = '#1a1612';
const PAPER = '#f8f4ea';
const CLARET = '#8a1818';
const GOLD = '#8a6a45';
const QUILL = '#6b4f3a';
const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const BODY_FONT = "'EB Garamond', Georgia, serif";
// ─── HTML helpers ─────────────────────────────────────────────────────────────

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

export interface RunRow {
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

export function buildHeritageHtml(data: {
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
  venueMap?: VenueMapAssets | null;
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

  // Several dogs carry several armbands, each on its run row; one is named here only when shared.
  const armbands = [...new Set(data.runs.map(run => run.armband).filter(Boolean))];
  const soleArmband = armbands.length === 1 ? armbands[0] : null;

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
    ${renderVenueMapBlock(data.venueMap, data.venue)}
    ${soleArmband ? `<p style="margin:18px 0 0;padding:12px 16px;background:rgba(138,106,69,0.08);border-left:2px solid ${GOLD};border-right:2px solid ${GOLD};font-family:${BODY_FONT};font-size:12.5px;line-height:1.55;color:${INK};"><em style="font-family:${DISPLAY};font-style:italic;color:${CLARET};">Please bring</em> your registration papers, vaccination records, and a copy of this email. Armband <strong style="font-family:${DISPLAY};font-weight:500;">${esc(soleArmband)}</strong> will be issued at check-in.</p>` : ''}
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
      <p style="margin:0 0 12px;">We have the pleasure of confirming your entry to the <em style="font-family:${DISPLAY};font-style:italic;">${esc(data.showTitle)}</em>. Your entry has been accepted; your particulars are recorded as follows.</p>
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

// ─── Date labels ──────────────────────────────────────────────────────────────

export function formatTrialDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const month = s.toLocaleDateString('en-US', { month: 'long' });
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${month} ${s.getFullYear()}`
    : `${s.getDate()} ${month} – ${e.getDate()} ${e.toLocaleDateString('en-US', { month: 'long' })} ${e.getFullYear()}`;
}
