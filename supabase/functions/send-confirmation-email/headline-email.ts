const HN_PAPER = '#fafafa';
const HN_PAGE = '#e7e1d7';
const HN_INK = '#0a0a0a';
const HN_SOFT = '#2a2a2a';
const HN_MUTE = '#6b6b6b';
const HN_HAIR = '#d8d8d6';
const HN_ACCENT = '#c4302b';
const HN_ACCENT_SOFT = '#f5d9d5';
const HN_MARKER = '#ffe566';
const HN_DISPLAY = "'Inter Tight', Arial, sans-serif";
const HN_BODY = "'Inter', Arial, sans-serif";
const HN_MONO = "'IBM Plex Mono', 'Courier New', monospace";

interface RunRow {
  numeral: string;
  dayLabel: string;
  classLabel: string;
  judgeName: string;
  armband: string | null;
}

export interface HeadlineEmailData {
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

function infoCell(label: string, value: string | null): string {
  if (!value) return '';
  return `<p style="margin:0;font-family:${HN_MONO};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${HN_MUTE};">${label}</p><p style="margin:4px 0 12px;font-family:${HN_BODY};font-size:13px;line-height:1.55;color:${HN_INK};">${esc(value).replace(/\n/g, '<br/>')}</p>`;
}

function runsTableRows(runs: RunRow[]): string {
  return runs
    .map((run, index) => {
      const border = index === runs.length - 1 ? '' : `border-bottom:1px solid ${HN_HAIR};`;
      return `<tr>
        <td style="padding:9px 0;${border}font-family:${HN_MONO};font-size:12px;color:${HN_ACCENT};">${esc(run.numeral)}</td>
        <td style="padding:9px 0;${border}font-family:${HN_BODY};font-size:13px;color:${HN_SOFT};">${esc(run.dayLabel)}</td>
        <td style="padding:9px 0;${border}font-family:${HN_BODY};font-size:13px;color:${HN_SOFT};">${esc(run.classLabel)}</td>
        <td style="padding:9px 0;${border}font-family:${HN_BODY};font-size:13px;color:${HN_SOFT};">${esc(run.judgeName)}</td>
        <td style="padding:9px 0;${border}font-family:${HN_DISPLAY};font-weight:800;font-size:16px;color:${HN_INK};text-align:right;">${run.armband ? esc(run.armband) : '-'}</td>
      </tr>`;
    })
    .join('');
}

function headerCells(): string {
  return ['Trial', 'Day', 'Class', 'Judge', 'Armband']
    .map(
      (header, index) =>
        `<td style="padding:0 0 7px;border-bottom:1px solid ${HN_INK};font-family:${HN_MONO};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${HN_MUTE};${index === 4 ? 'text-align:right;' : ''}">${header}</td>`
    )
    .join('');
}

export function buildHeadlineHtml(data: HeadlineEmailData): string {
  const dogLine = [
    data.dogCallName ? `&ldquo;${esc(data.dogCallName)}&rdquo;` : null,
    data.dogBreed ? esc(data.dogBreed) : null,
    data.dogSex ? esc(data.dogSex) : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  const contactLine = data.secretaryEmail
    ? `<a href="mailto:${esc(data.secretaryEmail)}" style="color:${HN_ACCENT};text-decoration:none;">${esc(data.secretaryEmail)}</a>`
    : 'the Trial Secretary';
  const phonePart = data.secretaryPhone ? ` &middot; ${esc(data.secretaryPhone)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Inter+Tight:wght@500;700;800&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet"/>
<title>Entry Confirmation · ${esc(data.showTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${HN_PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${HN_PAGE};padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${HN_PAPER};">
  <tr>
    <td style="padding:28px 34px 20px;border-bottom:4px double ${HN_INK};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:${HN_ACCENT};color:${HN_PAPER};padding:5px 9px;font-family:${HN_MONO};font-size:10px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;">Confirmed</td>
        <td style="padding-left:10px;font-family:${HN_MONO};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${HN_MUTE};">${data.receiptNumber ? `Receipt #${esc(data.receiptNumber)}` : 'Entry receipt'}</td>
      </tr></table>
      <p style="margin:18px 0 10px;font-family:${HN_MONO};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${HN_MUTE};">${esc(data.clubName)}${data.clubCity ? ` &middot; ${esc(data.clubCity)}` : ''}</p>
      <h1 style="margin:0 0 12px;font-family:${HN_DISPLAY};font-size:42px;font-weight:800;line-height:0.95;color:${HN_INK};">You&rsquo;re <span style="background:${HN_MARKER};padding:0 6px;">in.</span></h1>
      <p style="margin:0;font-family:${HN_BODY};font-size:14px;color:${HN_SOFT};">${esc(data.showTitle)}<br/><span style="font-family:${HN_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${HN_MUTE};">${esc(data.dateRange)}</span></p>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 34px 10px;">
      <p style="margin:0 0 14px;font-family:${HN_BODY};font-size:15px;line-height:1.6;color:${HN_SOFT};">Dear <strong style="color:${HN_INK};">${esc(data.salutation)}</strong>, your entry has been recorded. The draw has been completed and the running order is set.</p>
      <p style="margin:0 0 10px;font-family:${HN_MONO};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${HN_ACCENT};">§ 01 · The dog</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${HN_INK};border-bottom:1px solid ${HN_INK};">
        <tr><td style="padding:16px 0;">
          <p style="margin:0 0 4px;font-family:${HN_DISPLAY};font-weight:800;font-size:24px;line-height:1.1;color:${HN_INK};">${esc(data.dogName)}</p>
          ${dogLine ? `<p style="margin:0 0 14px;font-family:${HN_MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${HN_MUTE};">${dogLine}</p>` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${headerCells()}</tr>
            ${runsTableRows(data.runs)}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${HN_HAIR};">
            <tr>
              <td style="padding-top:12px;font-family:${HN_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${HN_MUTE};">${data.runCount} ${data.runCount === 1 ? 'run' : 'runs'} &middot; fees received</td>
              <td style="padding-top:12px;font-family:${HN_DISPLAY};font-weight:800;font-size:28px;color:${HN_ACCENT};text-align:right;">${esc(data.totalFeesFormatted)}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 34px 4px;">
      <p style="margin:0 0 10px;font-family:${HN_MONO};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${HN_ACCENT};">§ 02 · Bring to check-in</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${HN_ACCENT_SOFT};border:1px solid ${HN_ACCENT};">
        <tr>
          <td style="padding:14px 16px;vertical-align:top;width:50%;">${infoCell('Doors', data.doorsTime)}${infoCell('First class', data.firstClassTime)}${infoCell('Crating', data.cratingNotes)}</td>
          <td style="padding:14px 16px;vertical-align:top;width:50%;">${infoCell('Venue', data.venue)}${infoCell('Parking', data.parkingNotes)}${infoCell('Hospitality', data.hospitalityNotes)}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 34px 30px;">
      <p style="margin:0 0 10px;font-family:${HN_MONO};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${HN_ACCENT};">§ 03 · Contact</p>
      <p style="margin:0;font-family:${HN_BODY};font-size:14px;line-height:1.6;color:${HN_SOFT};">Questions or withdrawals go to ${contactLine}${phonePart}.</p>
      ${data.trialUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:18px;"><a href="${esc(data.trialUrl)}" style="display:inline-block;background:${HN_INK};color:${HN_PAPER};padding:12px 18px;font-family:${HN_DISPLAY};font-weight:700;font-size:14px;text-decoration:none;">View trial particulars</a></td></tr></table>` : ''}
    </td>
  </tr>
  <tr>
    <td style="background:${HN_INK};padding:22px 34px;text-align:center;">
      <p style="margin:0;font-family:${HN_MONO};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${HN_PAPER};">${esc(data.clubName)}</p>
      <p style="margin:8px 0 0;font-family:${HN_BODY};font-size:11px;color:rgba(250,250,250,0.7);">${esc(data.memberClubLanguage)}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
