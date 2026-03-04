/**
 * Print report generation service.
 * Opens a new browser window with the report and triggers print dialog.
 * Pattern adapted from myK9Q's reportService.ts.
 */

import ReactDOMServer from 'react-dom/server';
import React from 'react';
import { notifications } from '@/lib/notifications';
import { PRINT_STYLES } from './print-styles';
import { RunOrderSheet, ResultsReport, BlankScoreSheet } from './print-templates';
import type { PrintClassInfo, PrintReportEntry } from './print-types';

/** Generate complete HTML document for a print window */
const generatePrintHTML = (title: string, content: string): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body class="print-preview">
  ${content}
  <script>
    window.onload = function() { window.print(); };
    window.onafterprint = function() { setTimeout(function() { window.close(); }, 500); };
  </script>
</body>
</html>`;

/** Open print window, write HTML, trigger print */
function openPrintWindow(html: string): void {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    notifications.error('Unable to open print window. Check your popup blocker settings.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}

/** Render a React component to HTML and open it in a print window */
function renderAndPrint<P extends object>(
  Component: React.ComponentType<P>,
  props: P,
  title: string
): void {
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Component, props));
  openPrintWindow(generatePrintHTML(title, html));
}

/** Generate and print a Run Order / Check-In sheet */
export function generateRunOrder(classInfo: PrintClassInfo, entries: PrintReportEntry[]): void {
  renderAndPrint(RunOrderSheet, { classInfo, entries }, `${classInfo.className} — Run Order`);
}

/** Generate and print a blank Score Sheet for judges */
export function generateScoreSheet(classInfo: PrintClassInfo, entries: PrintReportEntry[]): void {
  renderAndPrint(BlankScoreSheet, { classInfo, entries }, `${classInfo.className} — Scoresheet`);
}

/** Generate and print a Results Report */
export function generateResults(classInfo: PrintClassInfo, entries: PrintReportEntry[]): void {
  const scored = entries.filter(e => e.isScored);
  if (scored.length === 0) {
    notifications.warning('No scored entries to display in results report.');
    return;
  }
  renderAndPrint(ResultsReport, { classInfo, entries: scored }, `${classInfo.className} — Results`);
}
