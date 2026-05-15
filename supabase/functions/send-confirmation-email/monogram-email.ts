// supabase/functions/send-confirmation-email/monogram-email.ts
//
// Monogram confirmation email — Deno HTML builder.
//
// Deno edge functions cannot import from workspace packages, so this file
// keeps a local copy of the Monogram palette + font stack. The canonical
// React Email implementation lives in
// packages/email/src/templates/MonogramConfirmationEmail.tsx — keep these
// two in visual sync.
//
// Important: the embossed-monogram effect (background-clip:text gradient
// + text-shadow) is **web-only**. Outlook strips background-clip, so the
// monogram letters here render as solid INK color.

const MG_INK = '#1c1815';
const MG_PAPER = '#f3eee4';
const MG_PAPER_DEEP = '#ece5d4';
const MG_BRONZE = '#8a6938';
const MG_QUILL = '#5a4f3e';
const MG_MUTE = '#7a6f5e';
const MG_MONOGRAM = "'Italiana', 'Bodoni Moda', serif";
const MG_DISPLAY = "'Bodoni Moda', Georgia, serif";
const MG_BODY = "'Crimson Pro', Georgia, serif";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface MonogramEmailData {
  monogramLetters: string;
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
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escape + convert newlines to <br/> for multi-line free-form fields.
// Order matters: HTML-escape FIRST, then inject <br/> — flipping would let a
// user inject markup via newlines.
function escMultiline(s: string | null | undefined): string {
  return esc(s).replace(/\n/g, '<br/>');
}

function ornamentRule(color = MG_INK, width = 90): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td style="width:${width}px;vertical-align:middle;font-size:0;line-height:0;">
      <div style="width:${width}px;height:1px;background:${color};font-size:0;line-height:0;">&nbsp;</div>
    </td>
    <td style="padding:0 10px;font-family:${MG_MONOGRAM};font-size:14px;line-height:1;color:${MG_BRONZE};vertical-align:middle;">◆</td>
    <td style="width:${width}px;vertical-align:middle;font-size:0;line-height:0;">
      <div style="width:${width}px;height:1px;background:${color};font-size:0;line-height:0;">&nbsp;</div>
    </td>
  </tr>
</table>`;
}

function infoCell(label: string, value: string | null): string {
  if (!value) return '';
  return `<p style="margin:0;font-family:${MG_DISPLAY};font-style:italic;color:${MG_QUILL};font-size:12px;">${esc(label)}</p>
<p style="margin:2px 0 10px;color:${MG_INK};font-family:${MG_BODY};font-size:13px;line-height:1.55;">${escMultiline(value)}</p>`;
}

function runsTable(runs: RunRow[]): string {
  const headerCells = ['Trial', 'Day', 'Class', 'Judge', 'Armband']
    .map(
      (h, i) =>
        `<td style="padding:8px 0;border-bottom:1px solid ${MG_BRONZE};font-family:${MG_DISPLAY};font-size:10.5px;letter-spacing:0.12em;color:${MG_QUILL};text-transform:uppercase;text-align:${i === 4 ? 'right' : 'left'};">${h}</td>`
    )
    .join('');

  const rows = runs
    .map((r, i) => {
      const last = i === runs.length - 1;
      const border = last ? '' : `border-bottom:1px dotted ${MG_MUTE};`;
      return `<tr>
  <td style="padding:8px 0;${border}font-family:${MG_MONOGRAM};font-style:italic;color:${MG_BRONZE};font-size:14px;">${esc(r.numeral)}</td>
  <td style="padding:8px 0;${border}font-family:${MG_BODY};font-size:13px;color:${MG_INK};">${esc(r.dayLabel)}</td>
  <td style="padding:8px 0;${border}font-family:${MG_BODY};font-size:13px;color:${MG_INK};">${esc(r.classLabel)}</td>
  <td style="padding:8px 0;${border}font-family:${MG_BODY};font-size:13px;color:${MG_INK};">${esc(r.judgeName)}</td>
  <td style="padding:8px 0;${border}font-family:${MG_DISPLAY};font-weight:500;font-size:16px;color:${MG_INK};text-align:right;">${r.armband ? esc(r.armband) : '—'}</td>
</tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>${headerCells}</tr>
  ${rows}
</table>`;
}

export function buildMonogramHtml(data: MonogramEmailData): string {
  const dogLine = [data.dogCallName ? `called "${data.dogCallName}"` : null, data.dogBreed, data.dogSex]
    .filter(Boolean)
    .join(' · ');

  const clubByline = [data.clubEstablished ? `Est. ${data.clubEstablished}` : null, data.clubCity]
    .filter(Boolean)
    .join(' · ');

  const venueBlock = infoCell('Venue', data.venue);
  const doorsBlock = infoCell('Doors open', data.doorsTime);
  const firstClassBlock = infoCell('First class', data.firstClassTime);
  const parkingBlock = infoCell('Parking', data.parkingNotes);
  const hospitalityBlock = infoCell('Hospitality', data.hospitalityNotes);
  const cratingBlock = infoCell('Crating', data.cratingNotes);

  const contactPieces: string[] = ['To withdraw or amend your entry, please contact the trial secretary'];
  if (data.secretaryEmail) {
    contactPieces.push(
      ` at <a href="mailto:${esc(data.secretaryEmail)}" style="color:${MG_BRONZE};text-decoration:none;">${esc(data.secretaryEmail)}</a>`
    );
  }
  if (data.secretaryPhone) contactPieces.push(` · ${esc(data.secretaryPhone)}`);
  contactPieces.push('.');
  const contactLine = contactPieces.join('');

  const ctaBlock = data.trialUrl
    ? `<tr>
  <td align="center" style="padding:0 48px 24px;">
    <a href="${esc(data.trialUrl)}" style="display:inline-block;padding:12px 28px;background:${MG_INK};color:${MG_PAPER};font-family:${MG_DISPLAY};font-size:12px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;border-radius:1px;">View trial particulars</a>
  </td>
</tr>`
    : '';

  const signatureBlock =
    data.trialChairName || data.trialChairTitle
      ? `<tr>
  <td style="padding:8px 56px 24px;font-family:${MG_BODY};font-size:13px;line-height:1.55;color:${MG_INK};">
    <p style="margin:0;">Most sincerely,</p>
    ${data.trialChairName ? `<p style="margin:6px 0 0;font-family:${MG_DISPLAY};font-style:italic;font-size:16px;color:${MG_BRONZE};">${esc(data.trialChairName)}</p>` : ''}
    ${data.trialChairTitle ? `<p style="margin:0;font-family:${MG_DISPLAY};font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:${MG_MUTE};">${esc(data.trialChairTitle)}</p>` : ''}
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
<link href="https://fonts.googleapis.com/css2?family=Italiana&family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Crimson+Pro:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${MG_PAPER_DEEP};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MG_PAPER_DEEP};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${MG_PAPER};">

  <!-- HEADER -->
  <tr>
    <td align="center" style="padding:48px 48px 16px;">
      <div style="font-family:${MG_MONOGRAM};font-size:84px;line-height:1;color:${MG_INK};letter-spacing:0.04em;">${esc(data.monogramLetters)}</div>
      <p style="margin:14px 0 4px;font-family:${MG_DISPLAY};font-style:italic;font-size:20px;color:${MG_INK};">${esc(data.clubName)}</p>
      ${clubByline ? `<p style="margin:0;font-family:${MG_DISPLAY};font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:${MG_MUTE};">${esc(clubByline)}</p>` : ''}
    </td>
  </tr>

  <!-- ORNAMENT -->
  <tr>
    <td align="center" style="padding:8px 48px 16px;">${ornamentRule(MG_BRONZE, 90)}</td>
  </tr>

  <!-- SHOW TITLE + DATES -->
  <tr>
    <td align="center" style="padding:0 48px 24px;">
      <h1 style="margin:0;font-family:${MG_DISPLAY};font-weight:500;font-size:28px;color:${MG_INK};line-height:1.15;">${esc(data.showTitle)}</h1>
      <p style="margin:8px 0 0;font-family:${MG_DISPLAY};font-style:italic;font-size:15px;color:${MG_QUILL};">${esc(data.dateRange)}</p>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:8px 56px 6px;font-family:${MG_BODY};font-size:15px;line-height:1.6;color:${MG_INK};">
      <p style="margin:0 0 12px;">Dear <em style="font-family:${MG_DISPLAY};font-style:italic;color:${MG_BRONZE};">${esc(data.salutation)}</em>,</p>
      <p style="margin:0 0 12px;">Your entry to <em style="font-family:${MG_DISPLAY};font-style:italic;">${esc(data.showTitle)}</em> is confirmed. The draw is set and your particulars are recorded as follows.</p>
    </td>
  </tr>

  <!-- ENTRY DETAIL CARD -->
  <tr>
    <td style="padding:8px 56px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MG_PAPER_DEEP};border:1px solid ${MG_BRONZE};border-radius:2px;">
        <tr>
          <td style="padding:20px 24px 12px;">
            <p style="margin:0;font-family:${MG_DISPLAY};font-style:italic;font-size:12px;color:${MG_QUILL};">Entry of</p>
            <p style="margin:2px 0 0;font-family:${MG_DISPLAY};font-weight:500;font-size:22px;color:${MG_INK};line-height:1.2;">${esc(data.dogName)}</p>
            ${dogLine ? `<p style="margin:4px 0 0;font-family:${MG_BODY};font-style:italic;font-size:13px;color:${MG_QUILL};">${esc(dogLine)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 16px;">${runsTable(data.runs)}</td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${MG_DISPLAY};font-style:italic;font-size:12px;color:${MG_QUILL};">${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'}${data.receiptNumber ? ` · ${esc(data.receiptNumber)}` : ''}</td>
                <td style="font-family:${MG_DISPLAY};font-size:18px;color:${MG_BRONZE};text-align:right;">${esc(data.totalFeesFormatted)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ON THE DAY -->
  <tr>
    <td style="padding:8px 56px 8px;">
      <h2 style="margin:0 0 8px;font-family:${MG_DISPLAY};font-weight:500;font-size:18px;color:${MG_INK};">On the day</h2>
      ${doorsBlock}${firstClassBlock}${venueBlock}${parkingBlock}${hospitalityBlock}${cratingBlock}
    </td>
  </tr>

  <!-- ORNAMENT -->
  <tr>
    <td align="center" style="padding:16px 48px 8px;">${ornamentRule(MG_BRONZE, 90)}</td>
  </tr>

  <!-- WITHDRAW / CONTACT -->
  <tr>
    <td style="padding:4px 56px 16px;font-family:${MG_BODY};font-size:13px;line-height:1.6;color:${MG_INK};">
      <p style="margin:0;">${contactLine}</p>
    </td>
  </tr>

  ${ctaBlock}
  ${signatureBlock}

  <!-- FOOTER -->
  <tr>
    <td style="padding:24px 56px 36px;background:${MG_INK};color:rgba(243,238,228,0.7);font-family:${MG_BODY};font-size:11px;line-height:1.55;">
      <p style="margin:0;">${esc(data.memberClubLanguage)}</p>
      <p style="margin:12px 0 0;font-size:10.5px;color:rgba(243,238,228,0.55);">You received this confirmation because you submitted an entry.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
