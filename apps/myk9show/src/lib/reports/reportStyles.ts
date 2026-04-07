/**
 * REPORT_STYLES — Inlined CSS for iframe-based report previews.
 *
 * These styles are inlined because dynamically-written iframes cannot load
 * external stylesheets. Based on myK9Q's print-reports.css, adapted for
 * myK9Show branding (teal #14b8a6 accent, no CSS custom-property tokens).
 */
export const REPORT_STYLES = `
@page {
  size: letter;
  margin: 0.5in;
}

/* ─── Base ────────────────────────────────────────────────────────────── */

body {
  margin: 0;
  padding: 0;
}

.report-page {
  font-family: Arial, sans-serif;
  color: #000;
  background: #fff;
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0.5in;
  box-sizing: border-box;
}

/* Batch mode: each subsequent page starts on a new printed page */
.report-page + .report-page {
  page-break-before: always;
}

/* ─── Header ──────────────────────────────────────────────────────────── */

.report-header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
  padding-top: 8px;
}

.report-logo {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 16px;
  font-weight: bold;
  color: #14b8a6;
}

.report-title {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  padding: 0;
  line-height: 1.2;
  text-align: center;
}

.report-subtitle {
  font-size: 14px;
  font-weight: normal;
  margin: 4px 0 0 0;
  text-align: center;
}

/* ─── Trial Info Box ──────────────────────────────────────────────────── */

.trial-info-box {
  border: 1px solid #000;
  padding: 12px 16px;
  margin: 16px 0 24px 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 24px;
}

.info-row {
  display: flex;
  gap: 8px;
}

.info-label {
  font-weight: 600;
}

.info-value {
  font-weight: normal;
}

/* ─── Table ───────────────────────────────────────────────────────────── */

.report-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 11px;
}

.report-table th {
  background-color: #f0f0f0;
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: left;
  font-weight: bold;
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.report-table td {
  border: 1px solid #ccc;
  padding: 6px 8px;
  vertical-align: middle;
}

/* Alternating row background for readability */
.report-table tbody tr:nth-child(even) {
  background-color: #fafafa;
}

/* ─── Column widths ───────────────────────────────────────────────────── */

.checkbox-col  { width: 30px; }
.armband-col   { width: 70px; }
.callname-col  { width: 100px; }
.runorder-col  { width: 80px; }
.breed-col     { width: 150px; }
.akc-col       { width: 100px; }
.handler-col   { width: auto; }
.place-col     { width: 50px; text-align: center; }
.qualified-col { width: 80px; }
.faults-col    { width: 60px; text-align: center; }
.time-col      { width: 80px; text-align: right; }

/* ─── Checkbox ────────────────────────────────────────────────────────── */

.checkbox-cell {
  text-align: center;
  padding: 4px;
}

.checkbox-square {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid #000;
  vertical-align: middle;
  position: relative;
  text-align: center;
}

/* ─── Result status ───────────────────────────────────────────────────── */

.qualified-text {
  color: #14b8a6;
  font-weight: bold;
}

.nq-text {
  color: #ef4444;
  font-weight: bold;
}

.place-cell {
  font-weight: bold;
  text-align: center;
}

.time-cell {
  font-family: 'Courier New', monospace;
}

/* ─── Footer ──────────────────────────────────────────────────────────── */

.report-footer {
  margin-top: 32px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: normal;
  padding-top: 16px;
  border-top: 1px solid #ccc;
}

.footer-left  { text-align: left; }
.footer-right { text-align: right; }

.qualified-count {
  margin-left: 24px;
}

/* ─── Scoresheet-specific ─────────────────────────────────────────────── */

.scoresheet-header {
  border: 1px solid #000;
  padding: 0.4rem 0.5rem;
  margin-bottom: 0.5rem;
}
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #ccc;
}
.header-entries {
  font-size: 11px;
  font-weight: 600;
}
.header-columns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.5rem 1rem;
  font-size: 10px;
}
.header-col {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.scoresheet-entries {
  margin-top: 16px;
}

.scoresheet-entry-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.scoresheet-entry-info {
  font-size: 11px;
}

.scoresheet-entry-results {
  font-size: 11px;
  text-align: center;
}

.scoresheet-entry-reasons {
  font-size: 11px;
}

.scoresheet-entry-time {
  font-size: 11px;
  text-align: right;
  font-family: 'Courier New', monospace;
}

/* ─── Print overrides ─────────────────────────────────────────────────── */

@media print {
  body {
    margin: 0;
    padding: 0;
  }

  .report-page {
    padding: 0;
    max-width: none;
  }

  .qualified-text {
    color: #14b8a6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .nq-text {
    color: #ef4444;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-table th {
    background-color: #f0f0f0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-table tbody tr:nth-child(even) {
    background-color: #fafafa;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-table {
    page-break-inside: auto;
  }

  .report-table tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }

  .report-table thead {
    display: table-header-group;
  }

  .report-table tfoot {
    display: table-footer-group;
  }

  .report-header,
  .trial-info-box {
    page-break-after: avoid;
  }
}
`.trim();
