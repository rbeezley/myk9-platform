import { escapeHtml } from '@/utils/escapeHtml';

interface PrintShowAccessSlipArgs {
  showName?: string;
  showDate?: string;
  exhibitorCode: string;
  qrMarkup: string;
}

export function printShowAccessSlip({
  showName,
  showDate,
  exhibitorCode,
  qrMarkup,
}: PrintShowAccessSlipArgs): void {
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;

  const titleShowName = escapeHtml(showName ?? 'Show');
  const printedShowName = escapeHtml(showName ?? 'Dog Show');
  const printedShowDate = showDate ? escapeHtml(showDate) : '';
  const printedExhibitorCode = escapeHtml(exhibitorCode);

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Show Access: ${titleShowName}</title>
  <style>
    body{font-family:sans-serif;display:flex;justify-content:center;padding:32px}
    .slip{border:2px dashed #ccc;border-radius:12px;padding:24px;width:280px;text-align:center}
    .show-name{font-size:18px;font-weight:bold;margin-bottom:4px}
    .show-date{font-size:13px;color:#666;margin-bottom:16px}
    .qr{margin:0 auto 16px}
    .code{font-family:monospace;font-size:28px;font-weight:bold;letter-spacing:4px;margin-bottom:8px}
    .url{font-size:11px;color:#888}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="slip">
    <div class="show-name">${printedShowName}</div>
    ${printedShowDate ? `<div class="show-date">${printedShowDate}</div>` : ''}
    <div class="qr">${qrMarkup}</div>
    <div class="code">${printedExhibitorCode}</div>
    <div class="url">myk9show.com/at-show</div>
  </div>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}
