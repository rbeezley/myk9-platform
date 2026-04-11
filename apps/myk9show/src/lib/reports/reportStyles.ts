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

/* ─── Show Flyer ──────────────────────────────────────────────────────── */

.flyer-page {
  font-family: Arial, sans-serif;
  color: #000;
  background: #fff;
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0.75in 0.75in 0.5in;
  box-sizing: border-box;
  min-height: 11in;
  display: flex;
  flex-direction: column;
}

.flyer-page + .flyer-page {
  page-break-before: always;
}

.flyer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;
}

.flyer-brand-name {
  font-size: 22px;
  font-weight: bold;
  color: #14b8a6;
  letter-spacing: -0.5px;
}

.flyer-brand-tagline {
  font-size: 12px;
  color: #666;
  margin-left: 2px;
}

.flyer-show-title {
  font-size: 28px;
  font-weight: bold;
  margin: 0 0 6px 0;
  line-height: 1.2;
}

.flyer-show-meta {
  font-size: 15px;
  color: #444;
  margin: 0 0 40px 0;
}

.flyer-qr-section {
  display: flex;
  align-items: flex-start;
  gap: 40px;
  margin-bottom: 40px;
}

.flyer-qr-block {
  flex-shrink: 0;
}

.flyer-qr-label {
  font-size: 11px;
  color: #888;
  text-align: center;
  margin-top: 6px;
}

.flyer-passcode-block {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.flyer-passcode-label {
  font-size: 12px;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.flyer-passcode-value {
  font-family: 'Courier New', monospace;
  font-size: 42px;
  font-weight: bold;
  letter-spacing: 8px;
  color: #14b8a6;
  margin-bottom: 10px;
}

.flyer-passcode-hint {
  font-size: 13px;
  color: #555;
  max-width: 320px;
  line-height: 1.5;
}

.flyer-passcode-url {
  font-size: 13px;
  color: #888;
  margin-top: 6px;
}

.flyer-divider {
  border: none;
  border-top: 1px solid #ddd;
  margin: 24px 0;
}

.flyer-footer-note {
  font-size: 11px;
  color: #aaa;
  margin-top: auto;
  padding-top: 24px;
}

/* Guide page (page 2) */

.flyer-guide-heading {
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 6px 0;
}

.flyer-guide-subheading {
  font-size: 14px;
  color: #555;
  margin: 0 0 32px 0;
}

.flyer-guide-section {
  margin-bottom: 28px;
}

.flyer-guide-section-title {
  font-size: 14px;
  font-weight: bold;
  color: #14b8a6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid #e0f2f0;
}

.flyer-guide-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.8;
  color: #333;
}

.flyer-guide-steps {
  counter-reset: step;
  list-style: none;
  padding-left: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #333;
}

.flyer-guide-steps li {
  counter-increment: step;
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.flyer-guide-steps li::before {
  content: counter(step);
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  background: #14b8a6;
  color: #fff;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  margin-top: 1px;
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

  .flyer-page {
    padding: 0.75in;
    max-width: none;
  }

  .flyer-passcode-value {
    color: #14b8a6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .flyer-brand-name {
    color: #14b8a6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .flyer-guide-section-title {
    color: #14b8a6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .flyer-guide-steps li::before {
    background: #14b8a6;
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

/* ─── Catalog layouts ─────────────────────────────────────────────────── */

.catalog-trial-section {
  margin-bottom: 24px;
}

.catalog-trial-header {
  font-size: 14px;
  font-weight: bold;
  border-bottom: 2px solid #14b8a6;
  margin-bottom: 8px;
  padding-bottom: 4px;
}

.catalog-class-section {
  margin-bottom: 20px;
}

.catalog-class-header {
  font-size: 13px;
  font-weight: bold;
  background: #f0fdfa;
  padding: 4px 8px;
  margin-bottom: 6px;
}

.catalog-class-summary {
  font-size: 10px;
  color: #555;
  text-align: right;
  margin-top: 4px;
}

.catalog-empty {
  color: #888;
  font-style: italic;
  font-size: 11px;
}

/* ─── AKC Form layouts ────────────────────────────────────────────────── */

.form-section {
  margin-bottom: 16px;
}

.form-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.form-table td {
  padding: 4px 8px;
  vertical-align: top;
}

.form-label {
  font-weight: bold;
  white-space: nowrap;
  width: 180px;
  font-size: 11px;
}

.form-value {
  border-bottom: 1px solid #000;
  min-width: 160px;
  font-size: 11px;
}

.form-address {
  font-size: 10px;
  margin-top: 4px;
  font-style: italic;
}

.form-question {
  font-size: 11px;
  margin-bottom: 6px;
}

.form-checkbox-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 11px;
}

.form-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.form-inline-label {
  font-size: 11px;
  margin-left: 8px;
}

.form-blank-lines {
  margin-top: 6px;
}

.form-blank-line {
  border-bottom: 1px solid #000;
  min-height: 20px;
  margin-bottom: 8px;
  font-size: 11px;
}

.form-field-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
}

.form-signature-section {
  margin-top: 32px;
  border-top: 1px solid #ccc;
  padding-top: 16px;
}

.signature-line {
  display: flex;
  gap: 16px;
  align-items: baseline;
  margin-bottom: 16px;
}

.signature-label {
  font-size: 11px;
  white-space: nowrap;
  min-width: 160px;
}

.signature-blank {
  border-bottom: 1px solid #000;
  flex: 1;
  min-height: 18px;
  display: block;
}

.total-row td {
  border-top: 2px solid #000;
}
`.trim();
