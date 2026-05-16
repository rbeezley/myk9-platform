// supabase/functions/send-confirmation-email/magazine-email.ts
//
// Magazine confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Magazine palette + font stack. The canonical
// React Email implementation lives in
// packages/email/src/templates/MagazineConfirmationEmail.tsx — keep these
// two in visual sync.
//
// Outlook safety guarantees (per reconciliation notes §"Gradient text in
// email — Outlook caveat"):
//  - NO `background-clip: text` / `-webkit-background-clip` anywhere
//  - ALL gold italic emphasis uses solid `color: ${GOLD3}` directly
//  - The footer's dark gradient is on a `<td>` with a `bgcolor` fallback
//  - The gold rule is a 2px-high `<div>` (not a CSS-on-text effect)

const MZ_PAPER = '#f6f1e8';
const MZ_PAPER_DEEP = '#ece4d3';
const MZ_INK = '#1a1a1a';
const MZ_SOFT = '#2e2820';
const MZ_MUTE = '#7a6e58';
const MZ_QUILL = '#5c4f3a';
const MZ_GOLD1 = '#c9a87c';
const MZ_GOLD2 = '#a8814f';
const MZ_GOLD3 = '#4a3826';
const MZ_PAGE = '#dad2bd';
const MZ_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const MZ_BODY = "'Source Serif 4', Georgia, serif";
const MZ_META = "'Inter Tight', Arial, sans-serif";

interface RunRow {
  /** Lowercase Roman numeral, e.g. "i", "iii". */
  trialNumeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface MagazineEmailData {
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  dateRange: string;
  /** Edition strip kicker, e.g. "Vol LXXIX · Spring 2026". */
  editionLabel: string;
  salutation: string;
  dogName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: RunRow[];
  runCount: number;
  totalFeesFormatted: string;
  receiptNumber: string | null;
  /** Single armband when all runs share one. Null when no armband assigned
   *  or runs have different armbands. */
  primaryArmband: string | null;
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
  /** e.g. "License № 2026-2841" — optional fine-print line in the footer. */
  licenseReference: string | null;
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
  const dottedGold = `1px dotted ${MZ_GOLD2}`;

  const header = ['Trial', 'Day', 'Class', 'Judge', '№']
    .map(
      (h, i) =>
        `<th align="${i === 4 ? 'right' : 'left'}" style="padding:10px 8px 8px 0;font-family:${MZ_META};font-weight:500;font-size:9px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_MUTE};border-bottom:${dottedGold};">${h}</th>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const isLast = i === runs.length - 1;
      const border = isLast ? '' : `border-bottom:${dottedGold};`;
      return `<tr>
  <td style="padding:11px 8px 11px 0;font-family:${MZ_DISPLAY};font-style:italic;font-weight:500;font-size:18px;color:${MZ_GOLD3};${border}">${esc(r.trialNumeral)}</td>
  <td style="padding:11px 8px;font-family:${MZ_BODY};font-size:13px;color:${MZ_INK};${border}">${esc(r.dayLabel)}</td>
  <td style="padding:11px 8px;font-family:${MZ_DISPLAY};font-style:italic;font-size:15px;color:${MZ_INK};${border}">${esc(r.classLabel)}</td>
  <td style="padding:11px 8px;font-family:${MZ_BODY};font-size:13px;color:${MZ_INK};${border}">${esc(r.judgeName)}</td>
  <td align="right" style="padding:11px 0 11px 8px;font-family:${MZ_DISPLAY};font-weight:500;font-size:20px;color:${MZ_INK};${border}">${r.armband ? esc(r.armband) : '—'}</td>
</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <thead><tr>${header}</tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function goldRule(thick = false): string {
  const h = thick ? 2 : 1;
  return `<div style="height:${h}px;background:linear-gradient(90deg, ${MZ_GOLD1}, ${MZ_GOLD2});line-height:${h}px;font-size:0;">&nbsp;</div>`;
}

function infoCell(
  label: string,
  value: string | null,
  opts: { borderLeft?: boolean; borderBottom?: string } = {}
): string {
  if (!value) return '';
  const borderLeft = opts.borderLeft ? `border-left:1px dotted ${MZ_GOLD2};` : '';
  const borderBottom = opts.borderBottom ?? `1px dotted ${MZ_GOLD2}`;
  const padding = opts.borderLeft ? '14px 0 14px 16px' : '14px 16px 14px 0';
  return `<td width="50%" style="padding:${padding};border-bottom:${borderBottom};${borderLeft}vertical-align:top;">
  <div style="font-family:${MZ_META};font-weight:500;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_MUTE};margin-bottom:4px;">${esc(label)}</div>
  <div style="font-family:${MZ_DISPLAY};font-size:20px;color:${MZ_INK};white-space:pre-line;">${escMultiline(value)}</div>
</td>`;
}

export function buildMagazineHtml(data: MagazineEmailData): string {
  const dogLine = [
    data.dogCallName ? `called "${data.dogCallName}"` : null,
    data.dogBreed,
    data.dogSex,
  ]
    .filter(Boolean)
    .join(' · ');

  const eyebrow = data.receiptNumber
    ? `Confirmed · Entry № ${data.receiptNumber}`
    : 'Confirmed · Entry received';

  const totalRowRight = [
    data.receiptNumber ? `Receipt ${data.receiptNumber}` : null,
    data.totalFeesFormatted,
  ]
    .filter(Boolean)
    .join(' · ');

  const armbandRowLeft = data.primaryArmband
    ? `Armband <span style="color:${MZ_GOLD3};font-weight:500;font-size:22px;">${esc(data.primaryArmband)}</span> across all runs`
    : `${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'} entered`;

  const hasOnTheDay = !!(
    data.doorsTime ||
    data.firstClassTime ||
    data.venue ||
    data.parkingNotes ||
    data.hospitalityNotes ||
    data.cratingNotes
  );

  const onTheDayBlock = hasOnTheDay
    ? `<tr>
  <td style="padding:36px 40px 0;">
    <div style="font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_GOLD3};margin-bottom:8px;">Article ii · On the day</div>
    <h2 style="margin:0 0 24px;font-family:${MZ_DISPLAY};font-weight:500;font-size:34px;letter-spacing:-0.01em;line-height:1.05;color:${MZ_INK};">
      Be on site by <em style="font-style:italic;color:${MZ_GOLD3};">${esc(data.doorsTime ?? '7:30')}</em>.
    </h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${MZ_INK};">
      <tr>${infoCell('Doors open', data.doorsTime)}${infoCell('First class', data.firstClassTime, { borderLeft: true })}</tr>
      <tr>${infoCell('Crating', data.cratingNotes)}${infoCell('Parking', data.parkingNotes, { borderLeft: true })}</tr>
      <tr>${infoCell('Hospitality', data.hospitalityNotes, { borderBottom: `1px solid ${MZ_INK}` })}${infoCell('Venue', data.venue, { borderLeft: true, borderBottom: `1px solid ${MZ_INK}` })}</tr>
    </table>
  </td>
</tr>`
    : '';

  const withdrawContactPieces: string[] = [];
  if (data.secretaryEmail) {
    withdrawContactPieces.push(
      ` Email <a href="mailto:${esc(data.secretaryEmail)}" style="color:${MZ_INK};font-family:${MZ_DISPLAY};font-style:italic;font-size:17px;text-decoration:underline;">${esc(data.secretaryEmail)}</a>`
    );
  }
  if (data.secretaryPhone) withdrawContactPieces.push(` or telephone ${esc(data.secretaryPhone)}`);

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td style="padding:28px 40px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="${MZ_INK}" style="background:${MZ_INK};">
          <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:16px 28px;font-family:${MZ_DISPLAY};font-style:italic;font-size:16px;color:${MZ_PAPER};text-decoration:none;">View trial particulars →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`
    : '';

  const signoffBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:36px 40px 8px;font-family:${MZ_BODY};font-size:15px;line-height:1.7;color:${MZ_SOFT};">
    <p style="margin:0 0 18px;">With our compliments,</p>
    ${data.trialChairName ? `<p style="margin:0;font-family:${MZ_DISPLAY};font-style:italic;font-size:24px;color:${MZ_INK};">${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:4px 0 0;font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_GOLD3};">${esc(data.trialChairTitle)}</p>` : ''}
  </td>
</tr>`
      : '';

  const footerByline = [data.clubEstablished, data.clubCity, data.memberClubLanguage]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  const viewInBrowserCell = data.trialUrl
    ? `<a href="${esc(data.trialUrl)}" style="color:${MZ_MUTE};text-decoration:none;">View in browser</a>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(data.showTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&family=Inter+Tight:wght@500;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:32px 0;background:${MZ_PAGE};font-family:${MZ_BODY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MZ_PAGE};">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${MZ_PAPER};">

      <!-- TOP META STRIP -->
      <tr>
        <td style="padding:16px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="left" style="font-family:${MZ_META};font-weight:500;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_MUTE};">${esc(data.editionLabel)}</td>
              <td align="right" style="font-family:${MZ_META};font-weight:500;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_MUTE};">${viewInBrowserCell}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- HEADER -->
      <tr>
        <td style="padding:32px 40px 4px;">
          <div style="font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_GOLD3};margin-bottom:16px;">${esc(eyebrow)}</div>
          <h1 style="margin:0 0 16px;font-family:${MZ_DISPLAY};font-weight:500;font-size:46px;letter-spacing:-0.015em;line-height:1.0;color:${MZ_INK};">
            Your entry is <em style="font-style:italic;color:${MZ_GOLD3};">confirmed</em>.
          </h1>
          <p style="margin:0 0 16px;font-family:${MZ_DISPLAY};font-style:italic;font-size:18px;line-height:1.45;color:${MZ_QUILL};">
            ${esc(data.showTitle)} · ${esc(data.dateRange)}
          </p>
        </td>
      </tr>
      <tr><td style="padding:0 40px;">${goldRule(true)}</td></tr>

      <!-- GREETING -->
      <tr>
        <td style="padding:28px 40px 8px;font-family:${MZ_BODY};font-size:16px;line-height:1.7;color:${MZ_SOFT};">
          <p style="margin:0 0 14px;">Dear <em style="font-family:${MZ_DISPLAY};font-style:italic;color:${MZ_INK};font-size:18px;">${esc(data.salutation)}</em>,</p>
          <p style="margin:0 0 14px;">Your entry has been received and the draw is complete. You will find the dog, the runs, and your armband number below. Please bring this email to check-in.</p>
        </td>
      </tr>

      <!-- DETAIL CARD -->
      <tr>
        <td style="padding:28px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${MZ_INK};border-bottom:1px solid ${MZ_INK};">
            <tr><td style="padding:18px 0 6px;font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_GOLD3};">Article i · The dog</td></tr>
            <tr><td style="font-family:${MZ_DISPLAY};font-weight:500;font-size:28px;letter-spacing:-0.005em;color:${MZ_INK};line-height:1.1;">${esc(data.dogName)}</td></tr>
            ${dogLine ? `<tr><td style="padding:6px 0 18px;font-family:${MZ_DISPLAY};font-style:italic;font-size:16px;color:${MZ_QUILL};">${esc(dogLine)}</td></tr>` : ''}
            <tr><td style="padding:8px 0 0;">${goldRule()}<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>${runsTable(data.runs)}</td></tr>
            <tr>
              <td style="padding:14px 0 18px;border-top:1px solid ${MZ_INK};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" style="font-family:${MZ_DISPLAY};font-style:italic;font-size:15px;color:${MZ_QUILL};">${armbandRowLeft}</td>
                    <td align="right" style="font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${MZ_MUTE};">${esc(totalRowRight)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${onTheDayBlock}

      <!-- WITHDRAW -->
      <tr>
        <td style="padding:36px 40px 0;">
          <div style="font-family:${MZ_META};font-weight:500;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${MZ_GOLD3};margin-bottom:8px;">Article iii · If you must withdraw</div>
          <p style="margin:0;font-family:${MZ_BODY};font-size:15px;line-height:1.7;color:${MZ_SOFT};">
            The draw is set, so refunds are no longer available, but please notify the secretary if you cannot attend so we can release your slot.${withdrawContactPieces.join('')}.
          </p>
        </td>
      </tr>

      ${ctaBlock}
      ${signoffBlock}

      <!-- FOOTER (dark editorial band) -->
      <tr>
        <td bgcolor="${MZ_GOLD3}" style="padding:36px 40px;background:linear-gradient(135deg, ${MZ_GOLD3} 0%, ${MZ_SOFT} 60%, ${MZ_INK} 100%);color:${MZ_PAPER};">
          <div style="font-family:${MZ_DISPLAY};font-style:italic;font-size:20px;color:${MZ_PAPER};margin-bottom:6px;">${esc(data.clubName)}</div>
          ${footerByline ? `<div style="font-family:${MZ_BODY};font-size:12px;color:rgba(246,241,232,0.7);margin-bottom:20px;">${footerByline}</div>` : ''}
          <div style="font-family:${MZ_META};font-weight:500;font-size:9px;letter-spacing:0.32em;text-transform:uppercase;color:rgba(246,241,232,0.5);padding-top:18px;border-top:1px solid rgba(246,241,232,0.18);line-height:1.7;">
            You received this because you entered the ${esc(data.showTitle)}.${data.licenseReference ? ` · ${esc(data.licenseReference)}` : ''}
          </div>
        </td>
      </tr>

      <!-- Padding for paper-deep tone outside the body band -->
      <tr><td style="background:${MZ_PAPER_DEEP};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
