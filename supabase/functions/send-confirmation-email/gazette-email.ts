// supabase/functions/send-confirmation-email/gazette-email.ts
//
// Gazette confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Gazette palette + font stack. The canonical
// React Email implementation lives in
// packages/email/src/templates/GazetteConfirmationEmail.tsx — keep these
// two in visual sync.
//
// Outlook constraints (per README §Known Caveats):
//   - font-feature-settings ignored on 2007–2019 → body uses lining figures
//   - background-clip / OKLCH / color-mix() never used
//   - All horizontal layout via <table> for Outlook compatibility

const GZ_PAPER = '#f7f1e3';
const GZ_PAPER_WARM = '#ede5d2';
const GZ_INK = '#2a2520';
const GZ_SOFT = '#3d352c';
const GZ_MUTE = '#7a6e58';
const GZ_BROWN = '#6b4f3a';
const GZ_HAIR = '#b8a98a';
const GZ_DISPLAY = "'Playfair Display', Georgia, serif";
const GZ_BODY = "'Source Serif 4', Georgia, serif";
const GZ_META = "'IBM Plex Mono', Courier, monospace";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface GazetteEmailData {
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  dateRange: string;
  /** Optional edition strip, e.g. "VOL LXXIX · NO 47". Omit to suppress. */
  editionLabel: string | null;

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

/**
 * Auto-italicize the first and last word of clubName when there are ≥ 3
 * words, producing the canonical "*The* Bexar County *Gazette*" effect.
 * Three or fewer words pass through verbatim. Always emits already-escaped
 * output.
 */
function italicizeMasthead(clubName: string): string {
  const trimmed = clubName.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (words.length < 3) return esc(trimmed);
  const first = esc(words[0]);
  const last = esc(words[words.length - 1]);
  const middle = esc(words.slice(1, -1).join(' '));
  return `<em style="font-style:italic;font-weight:400;">${first}</em> ${middle} <em style="font-style:italic;font-weight:400;">${last}</em>`;
}

// ─── Runs table ─────────────────────────────────────────────────────────────
function runsTable(runs: RunRow[]): string {
  const headerCellBase = `padding:10px 8px 8px;border-bottom:1px dotted ${GZ_HAIR};font-family:${GZ_META};font-weight:500;font-size:9px;letter-spacing:0.18em;color:${GZ_MUTE};text-transform:uppercase;`;
  const header = `<tr>
  <th align="left" style="${headerCellBase}padding-left:0;">Trial</th>
  <th align="left" style="${headerCellBase}">Day</th>
  <th align="left" style="${headerCellBase}">Class</th>
  <th align="left" style="${headerCellBase}">Judge</th>
  <th align="right" style="${headerCellBase}padding-right:0;">№</th>
</tr>`;

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px dotted ${GZ_HAIR};`;
      return `<tr>
  <td style="padding:11px 8px 11px 0;${border}font-family:${GZ_DISPLAY};font-style:italic;font-weight:700;font-size:18px;color:${GZ_BROWN};">${esc(r.numeral.toLowerCase())}</td>
  <td style="padding:11px 8px;${border}font-family:${GZ_BODY};font-size:13px;color:${GZ_INK};">${esc(r.dayLabel)}</td>
  <td style="padding:11px 8px;${border}font-family:${GZ_DISPLAY};font-size:14px;color:${GZ_INK};">${esc(r.classLabel)}</td>
  <td style="padding:11px 8px;${border}font-family:${GZ_BODY};font-size:13px;color:${GZ_INK};">${esc(r.judgeName)}</td>
  <td align="right" style="padding:11px 0 11px 8px;${border}font-family:${GZ_DISPLAY};font-weight:900;font-size:20px;color:${GZ_INK};">${r.armband ? esc(r.armband) : '—'}</td>
</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${header}${rows}</table>`;
}

function infoBlock(label: string, value: string | null): string {
  if (!value) return '';
  return `<div style="margin-bottom:14px;">
  <p style="margin:0;font-family:${GZ_META};font-weight:500;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${GZ_MUTE};">${esc(label)}</p>
  <p style="margin:4px 0 0;font-family:${GZ_DISPLAY};font-weight:700;font-size:20px;letter-spacing:-0.005em;color:${GZ_INK};">${escMultiline(value)}</p>
</div>`;
}

export function buildGazetteHtml(data: GazetteEmailData): string {
  const dogLine = [data.dogCallName ? `"${data.dogCallName}"` : null, data.dogBreed, data.dogSex]
    .filter(Boolean)
    .join(' · ');

  const editionStrip = data.editionLabel
    ? `<tr>
  <td style="padding:16px 40px 8px;border-bottom:1px solid ${GZ_HAIR};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="left" style="font-family:${GZ_META};font-weight:500;font-size:10px;letter-spacing:0.06em;color:${GZ_BROWN};">${esc(data.editionLabel)}</td>
        <td align="center" style="font-family:${GZ_META};font-weight:500;font-size:10px;letter-spacing:0.06em;color:${GZ_BROWN};">TRIAL CONFIRMATION</td>
        <td align="right" style="font-family:${GZ_META};font-weight:500;font-size:10px;letter-spacing:0.06em;color:${GZ_BROWN};">${esc(data.dateRange.toUpperCase())}</td>
      </tr>
    </table>
  </td>
</tr>`
    : '';

  // Derive the section heading from the earliest arrival time the trial
  // actually publishes: doors first, first-class as fallback, neutral copy
  // otherwise. Avoids the hardcoded "half-past seven" headline that would
  // be plain wrong for a 8 AM / 9 AM trial.
  const arrivalAccent = data.doorsTime ?? data.firstClassTime;
  const onTheDayHeadline = arrivalAccent
    ? `Be on site by <em style="font-style:italic;font-weight:400;color:${GZ_BROWN};">${esc(arrivalAccent)}</em>.`
    : `On the <em style="font-style:italic;font-weight:400;color:${GZ_BROWN};">day</em>.`;

  const onTheDayBlock =
    data.doorsTime ||
    data.firstClassTime ||
    data.venue ||
    data.parkingNotes ||
    data.hospitalityNotes ||
    data.cratingNotes
      ? `<tr>
  <td style="padding:32px 40px 0;">
    <div style="font-family:${GZ_META};font-weight:600;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${GZ_BROWN};margin-bottom:6px;">Section B · On the Day</div>
    <h2 style="margin:0 0 18px;font-family:${GZ_DISPLAY};font-weight:900;font-size:28px;letter-spacing:-0.012em;line-height:1;color:${GZ_INK};">${onTheDayHeadline}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px solid ${GZ_INK};">
      <tr>
        <td width="50%" style="padding:14px 16px 14px 0;border-bottom:1px dotted ${GZ_HAIR};vertical-align:top;">
          ${infoBlock('Doors', data.doorsTime)}
          ${infoBlock('Crating', data.cratingNotes)}
          ${infoBlock('Parking', data.parkingNotes)}
        </td>
        <td width="50%" style="padding:14px 0 14px 16px;border-bottom:1px dotted ${GZ_HAIR};border-left:1px dotted ${GZ_HAIR};vertical-align:top;">
          ${infoBlock('First class', data.firstClassTime)}
          ${infoBlock('Venue', data.venue)}
          ${infoBlock('Hospitality', data.hospitalityNotes)}
        </td>
      </tr>
    </table>
  </td>
</tr>`
      : '';

  const noticeContact = data.secretaryEmail
    ? `<a href="mailto:${esc(data.secretaryEmail)}" style="color:${GZ_INK};font-family:${GZ_DISPLAY};font-style:italic;font-size:17px;text-decoration:underline;text-decoration-color:${GZ_HAIR};">${esc(data.secretaryEmail)}</a>`
    : 'the secretary';
  const noticePhone = data.secretaryPhone ? ` or call ${esc(data.secretaryPhone)}` : '';

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td style="padding:28px 40px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${GZ_INK};">
          <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:16px 28px;font-family:${GZ_DISPLAY};font-weight:700;font-size:15px;letter-spacing:0.04em;text-transform:uppercase;color:${GZ_PAPER};text-decoration:none;">View Trial Particulars ▸</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`
    : '';

  const signoffBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:32px 40px 8px;font-family:${GZ_BODY};font-size:15px;line-height:1.65;color:${GZ_SOFT};">
    <p style="margin:0 0 18px;">With our compliments,</p>
    ${data.trialChairName ? `<p style="margin:0;font-family:${GZ_DISPLAY};font-style:italic;font-weight:400;font-size:24px;color:${GZ_INK};">${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:4px 0 0;font-family:${GZ_META};font-weight:500;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${GZ_BROWN};">${esc(data.trialChairTitle)}</p>` : ''}
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
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#d8ceb6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#d8ceb6;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${GZ_PAPER};">

  ${editionStrip}

  <!-- MASTHEAD TITLE -->
  <tr>
    <td align="center" style="padding:20px 40px 12px;border-bottom:4px double ${GZ_INK};">
      <div style="font-family:${GZ_DISPLAY};font-weight:900;font-size:36px;letter-spacing:-0.015em;line-height:1;color:${GZ_INK};">${italicizeMasthead(data.clubName)}</div>
      ${data.clubEstablished ? `<div style="font-family:${GZ_META};font-weight:500;font-size:9px;letter-spacing:0.06em;color:${GZ_MUTE};margin-top:8px;">${esc(data.clubEstablished.toUpperCase())}</div>` : ''}
    </td>
  </tr>

  <!-- FRONT PAGE -->
  <tr>
    <td style="padding:28px 40px 16px;">
      <div style="font-family:${GZ_META};font-weight:600;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${GZ_BROWN};text-align:center;margin-bottom:14px;">Confirmed${data.receiptNumber ? ` · Receipt ${esc(data.receiptNumber)}` : ''}</div>
      <h1 style="margin:0 0 12px;font-family:${GZ_DISPLAY};font-weight:900;font-size:38px;letter-spacing:-0.015em;line-height:1;color:${GZ_INK};text-align:center;">Your entry is <em style="font-style:italic;font-weight:400;color:${GZ_BROWN};">confirmed</em>.</h1>
      <p style="margin:0;text-align:center;font-family:${GZ_DISPLAY};font-style:italic;font-weight:400;font-size:16px;line-height:1.5;color:${GZ_SOFT};">${esc(data.showTitle)} · ${esc(data.dateRange)}</p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:20px 40px 8px;font-family:${GZ_BODY};font-size:15px;line-height:1.65;color:${GZ_SOFT};">
      <p style="margin:0 0 14px;">Dear <em style="font-family:${GZ_DISPLAY};font-style:italic;font-weight:400;color:${GZ_INK};font-size:17px;">${esc(data.salutation)}</em>,</p>
      <p style="margin:0 0 14px;">Your entry has been received and the draw is complete. Below: the dog, the runs, and your armband — please bring this email to check-in or write the number on a slip of paper.</p>
      <p style="margin:0;">We look forward to seeing you.</p>
    </td>
  </tr>

  <!-- DETAIL CARD -->
  <tr>
    <td style="padding:24px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px solid ${GZ_INK};border-bottom:3px solid ${GZ_INK};">
        <tr>
          <td style="padding:14px 0 6px;font-family:${GZ_META};font-weight:600;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${GZ_BROWN};">Section A · The Dog</td>
        </tr>
        <tr>
          <td style="font-family:${GZ_DISPLAY};font-weight:900;font-size:24px;letter-spacing:-0.01em;color:${GZ_INK};line-height:1.1;">${esc(data.dogName)}</td>
        </tr>
        ${dogLine ? `<tr><td style="padding:6px 0 16px;font-family:${GZ_DISPLAY};font-style:italic;font-weight:400;font-size:14px;color:${GZ_BROWN};">${esc(dogLine)}</td></tr>` : ''}
        <tr>
          <td style="padding:8px 0 0;border-top:1px dotted ${GZ_HAIR};">${runsTable(data.runs)}</td>
        </tr>
        <tr>
          <td style="padding:14px 0;border-top:1px solid ${GZ_INK};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="font-family:${GZ_DISPLAY};font-style:italic;font-weight:400;font-size:15px;color:${GZ_SOFT};">${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'} · Armband across all</td>
                <td align="right" style="font-family:${GZ_META};font-weight:500;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${GZ_MUTE};">Total ${esc(data.totalFeesFormatted)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${onTheDayBlock}

  <!-- NOTICES -->
  <tr>
    <td style="padding:24px 40px 0;">
      <div style="font-family:${GZ_META};font-weight:600;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:${GZ_BROWN};margin-bottom:6px;">Section C · Notices</div>
      <p style="margin:0;font-family:${GZ_BODY};font-size:15px;line-height:1.65;color:${GZ_SOFT};">Draw is set, so refunds are no longer available, but please notify the secretary if you cannot attend so we can release your slot. Email ${noticeContact}${noticePhone} as early as you can.</p>
    </td>
  </tr>

  ${ctaBlock}
  ${signoffBlock}

  <!-- FOOTER -->
  <tr>
    <td style="padding:32px 40px;border-top:4px double ${GZ_INK};background:${GZ_PAPER_WARM};">
      <div style="font-family:${GZ_DISPLAY};font-weight:900;font-size:22px;letter-spacing:-0.012em;color:${GZ_INK};margin-bottom:6px;">${italicizeMasthead(data.clubName)}</div>
      ${data.clubEstablished ? `<div style="font-family:${GZ_META};font-size:11px;letter-spacing:0.04em;color:${GZ_MUTE};margin-bottom:18px;">${esc(data.clubEstablished.toUpperCase())} · ${esc(data.memberClubLanguage.toUpperCase())}</div>` : `<div style="font-family:${GZ_META};font-size:11px;letter-spacing:0.04em;color:${GZ_MUTE};margin-bottom:18px;">${esc(data.memberClubLanguage.toUpperCase())}</div>`}
      <div style="font-family:${GZ_META};font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(42,37,32,0.6);padding-top:16px;border-top:1px solid ${GZ_HAIR};line-height:1.7;">
        You received this because you entered the trial.
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
