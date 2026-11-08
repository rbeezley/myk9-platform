/**
 * Print stylesheet for the judge setup cheat sheet (MYK9-1078, MYK9-1772).
 *
 * The page is sized in physical units, never by viewport: the 2026-10-09 prototype printed
 * on a 16:9 page and cut off columns. US Letter landscape is 11in x 8.5in. The 0.25in margin
 * lives in the content, not in @page: Chrome's "Margins: None" (remembered from printing
 * labels) discards an @page margin and the header printed inside the printer's unprintable
 * area. So @page margin is 0 and each sheet is a fixed 11in x 8.45in box with 0.25in padding
 * (0.15in at the bottom, where the AKC page needs the room), identical under Default and
 * None. The box is 0.05in short of the paper as a cushion so rounding never spills a blank
 * sheet. Table text is 11pt and notes 10pt; nothing is below
 * 10pt. This <style> is embedded after the shared report styles, so its @page wins.
 */
export const SETUP_SHEET_STYLES = `
@page { size: 11in 8.5in; margin: 0; }

.setup-sheet { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.setup-sheet *, .setup-sheet *::before, .setup-sheet *::after { box-sizing: border-box; }

.setup-page {
  width: 11in;
  height: 8.45in;
  padding: 0.25in 0.25in 0.15in;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}
.setup-page + .setup-page { break-before: page; page-break-before: always; }

.setup-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.2in;
  padding: 0.05in 0.12in;
  background: var(--setup-accent);
  color: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.setup-title { margin: 0; font-size: 14pt; font-weight: bold; }
.setup-page-title { margin: 0; font-size: 12pt; font-weight: bold; }

.setup-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: var(--setup-table-pt, 11pt);
  line-height: 1.15;
}
.setup-table th, .setup-table td {
  border: 1px solid #000;
  padding: 0.015in 0.06in;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.setup-table .setup-label-col { width: 1.45in; }
.setup-table thead th {
  background: var(--setup-accent-light);
  font-size: calc(var(--setup-table-pt, 11pt) + 0.5pt);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.setup-level-note { display: block; font-size: 10pt; font-weight: normal; }
.setup-table .setup-group-row th {
  background: var(--setup-accent);
  color: #fff;
  font-size: 12pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.setup-table tbody th[scope="row"] { font-weight: bold; background: #f1f1f1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.setup-notes {
  list-style: none;
  margin: 0.06in 0 0;
  padding: 0;
  font-size: 10pt;
  line-height: 1.15;
}
.setup-notes li { margin: 0 0 0.03in; }

.setup-footer {
  margin-top: auto;
  padding-top: 0.04in;
  font-size: 10pt;
  border-top: 1px solid #000;
}

@media screen {
  .setup-page {
    margin-bottom: 0.3in;
    border: 1px solid #999;
    background: #fff;
  }
}
@media print {
  .setup-page { border: 0; margin: 0 auto; }
}
`;
