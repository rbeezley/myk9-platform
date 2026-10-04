/**
 * MYK9-1009: styles for the AKC marked catalog (Result Catalog).
 *
 * Separate from REPORT_STYLES, which is past the file-length ceiling, and
 * written into the report document by `renderReportToHtml`.
 *
 * The judge's-initials box has to appear on EVERY printed page (AKC Scent Work
 * Regulations Ch.3 §37), and it must not sit on top of a row. A `position:
 * fixed` box repeats on every page but overlays the foot of each one, and a
 * footer of a one-cell frame does not repeat at all (tried in Chromium: only the
 * last page printed it). The footer of a TABLE that is made of many rows does
 * repeat, and it reserves its own space, so the whole AKC catalog is one table:
 * column headings in <thead>, one <tbody> per class, and the initials box in
 * <tfoot>. `.report-table tfoot` is already `display: table-footer-group` in
 * print (REPORT_STYLES); the rule below states it again so this file stands alone.
 */
export const CATALOG_STYLES = `
.catalog-akc-table {
  table-layout: fixed;
}

.catalog-akc-table thead {
  display: table-header-group;
}

.catalog-akc-table tfoot {
  display: table-footer-group;
}

.catalog-akc-table tfoot td {
  border: 0;
  padding: 8px 0 0 0;
  background: transparent;
}

.catalog-class-heading {
  background: #f0fdfa;
  font-size: 13px;
  font-weight: bold;
  padding: 4px 8px;
  border: 0;
}

.catalog-class-heading h2 {
  font-size: 13px;
  margin: 0;
}

.catalog-class-facts-row td {
  border: 0;
  padding: 2px 0 6px 0;
  background: transparent;
}

.catalog-initials {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 8px;
  font-size: 11px;
  font-weight: bold;
}

.catalog-initials-box {
  display: inline-block;
  width: 0.9in;
  height: 0.35in;
  border: 1.5px solid #000;
}

.catalog-class-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-size: 10px;
  margin: 0;
}

.catalog-class-fact {
  white-space: nowrap;
}

.catalog-class-fact dt,
.catalog-class-fact dd {
  display: inline;
  margin: 0;
}

.catalog-class-fact dt {
  font-weight: bold;
}

.report-table.catalog-akc-table th,
.report-table.catalog-akc-table td {
  font-size: 8.5px;
  padding: 3px 4px;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.catalog-akc-table .catalog-subline {
  display: block;
  color: #333;
}

.catalog-akc-table .catalog-reason {
  display: block;
  font-style: italic;
  font-weight: normal;
}

@media print {
  .catalog-class-heading,
  .catalog-class-facts-row {
    page-break-after: avoid;
    break-after: avoid;
  }

  .catalog-initials-box {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;
