import ReactDOMServer from 'react-dom/server';
import React from 'react';
import { Entry } from '../stores/entryStore';
import { CheckInSheet, CheckInSheetProps } from '../components/reports/CheckInSheet';
import { ResultsSheet, ResultsSheetProps } from '../components/reports/ResultsSheet';
import { DogResultsSheet, DogResultsSheetProps } from '../components/reports/DogResultsSheet';
import { ScoresheetReport, ScoresheetReportProps } from '../components/reports/ScoresheetReport';
import { logger } from '@/utils/logger';

/**
 * Report generation service
 * Opens a new window with the report and triggers print dialog
 */

export interface ReportClassInfo {
  className: string;
  element: string;
  level: string;
  section: string;
  trialDate: string;
  trialNumber: string;
  judgeName: string;
  timeLimit?: string;
  showName?: string;
  organization?: string;
  activityType?: string; // e.g., "Scent Work", "FastCat"
}

/**
 * Inline CSS styles for print reports
 * Embedded directly to avoid external file loading issues
 */
const PRINT_STYLES = `
@page { size: letter; margin: 0.5in; }
.print-report { font-family: Arial, sans-serif; color: #000; background: #fff; max-width: 8.5in; margin: 0 auto; padding: 0.5in; box-sizing: border-box; }
.print-header { position: relative; text-align: center; margin-bottom: 1.5rem; padding-top: 0.5rem; }
.print-logo { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 8px; }
.print-logo .logo-img { height: 40px; width: 40px; display: block; }
.print-logo .logo-text { font-size: 24px; font-weight: bold; color: #14b8a6; letter-spacing: -0.5px; }
.print-title { font-size: 24px; font-weight: bold; margin: 0; padding: 0; line-height: 1.2; }
.show-id { position: absolute; right: 0; top: 0; font-size: 14px; font-weight: normal; }
.show-name { text-align: left; font-size: 16px; font-weight: 600; margin: 0.5rem 0; }
.trial-info-box { border: 1px solid #000; padding: 0.75rem; margin: 1rem 0 1.5rem 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
.info-row { display: flex; gap: 0.5rem; }
.info-label { font-weight: 600; }
.info-value { font-weight: normal; }
.print-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 11px; }
.print-table.with-margin { margin: 2rem 0; }
.print-table th { background-color: #f0f0f0; border: 1px solid #000; padding: 6px 8px; text-align: left; font-weight: bold; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
.print-table td { border: 1px solid #000; padding: 6px 8px; vertical-align: middle; }
.print-table tbody tr:nth-child(even) { background-color: #fafafa; }
.checkbox-cell { text-align: center; padding: 4px; }
.checkbox-square { display: inline-block; width: 16px; height: 16px; border: 2px solid #000; vertical-align: middle; }
.qualified-text { color: #14b8a6; font-weight: bold; }
.nq-text { color: #ef4444; font-weight: bold; }
.place-cell { font-weight: bold; text-align: center; }
.time-cell { font-family: 'Courier New', monospace; }
.print-footer { margin-top: 2rem; display: flex; justify-content: space-between; font-size: 11px; padding-top: 1rem; border-top: 1px solid #e0e0e0; }
.qualified-count { margin-left: 1.5rem; }
@media print {
  .print-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-table tbody tr:nth-child(even) { background-color: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .qualified-text { color: #14b8a6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .nq-text { color: #ef4444 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

/* Scoresheet-specific styles */
.scoresheet-report { font-size: 11px; padding: 0; }
.scoresheet-table { width: 100%; border-collapse: collapse; }
.scoresheet-table thead { display: table-header-group; }
.scoresheet-table th { padding: 0; border: none; background: none; font-weight: normal; text-align: left; }
.scoresheet-table td { padding: 0; border: none; vertical-align: top; }

/* Compact header */
.scoresheet-header { border: 1px solid #000; padding: 0.4rem 0.5rem; margin-bottom: 0.5rem; }
.header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem; padding-bottom: 0.25rem; border-bottom: 1px solid #ccc; }
.header-logo { display: flex; align-items: center; gap: 4px; }
.logo-img-sm { height: 24px; width: 24px; }
.logo-text-sm { font-size: 14px; font-weight: bold; color: #14b8a6; }
.header-title { font-size: 14px; font-weight: bold; }
.header-entries { font-size: 11px; font-weight: 600; }
.header-columns { display: flex; gap: 1.5rem; font-size: 10px; }
.header-col { display: flex; flex-direction: column; gap: 1px; }
.header-col:first-child { min-width: 140px; }
.header-col:nth-child(2) { min-width: 100px; }
.header-col:nth-child(3), .header-col:nth-child(4) { flex: 1; }

/* Entry rows */
.scoresheet-entries { display: flex; flex-direction: column; gap: 0.4rem; }
.scoresheet-entry-row { display: grid; grid-template-columns: 150px 140px 1fr 140px; gap: 0.5rem; border: 1px solid #000; padding: 0.5rem; page-break-inside: avoid; }
.entry-info { display: flex; gap: 0.5rem; align-items: flex-start; }
.entry-armband { font-size: 18px; font-weight: 700; min-width: 36px; }
.entry-details { display: flex; flex-direction: column; gap: 2px; }
.entry-callname { font-weight: 600; font-size: 12px; }
.entry-reg { font-size: 9px; color: #666; }
.entry-breed { font-size: 10px; color: #444; }
.entry-handler { font-size: 10px; font-weight: 500; margin-top: 4px; padding-top: 2px; border-top: 1px dotted #ccc; }

/* Results column */
.entry-results { display: flex; flex-direction: column; gap: 0.25rem; }
.results-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem; flex-wrap: wrap; }
.result-item { display: flex; align-items: center; gap: 3px; font-size: 9px; }
.result-item .checkbox-square { width: 12px; height: 12px; }
.result-qualified span, .result-nq span { font-weight: 600; }
.scoring-fields { display: flex; flex-direction: column; gap: 2px; }
.field-row { display: flex; align-items: baseline; gap: 0.25rem; }
.field-label { font-size: 9px; min-width: 75px; }
.field-line { width: 30px; border-bottom: 1px solid #999; }

/* Reasons column - NQ and Excused reasons */
.entry-reasons { display: flex; gap: 0.75rem; font-size: 8px; }
.reasons-group { display: flex; flex-direction: column; gap: 1px; }
.reasons-label { font-weight: 700; font-size: 9px; margin-bottom: 2px; }
.reasons-list { display: flex; flex-direction: column; gap: 1px; }
.reason-item { display: flex; align-items: center; gap: 3px; }
.reason-item .checkbox-square { width: 9px; height: 9px; border-width: 1px; }

/* Time entry - single area */
.entry-time { display: flex; gap: 4px; align-items: flex-start; }
.time-box { width: 40px; height: 40px; border: 1px solid #000; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.time-label { font-size: 9px; color: #666; margin-bottom: 3px; }

/* Time entry - multi-area (Interior Excellent/Master) */
.entry-time.multi-area { flex-direction: column; gap: 3px; }
.time-row { display: flex; gap: 3px; align-items: center; }
.time-row-total { margin-top: 2px; padding-top: 3px; border-top: 1px solid #999; }
.area-label { font-size: 9px; font-weight: 600; min-width: 20px; }
.time-box-sm { width: 28px; height: 28px; border: 1px solid #000; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.time-box-sm .time-label { font-size: 7px; margin-bottom: 2px; }

@media print {
  .scoresheet-entry-row { border: 1px solid #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/**
 * Generate complete HTML document for printing
 */
const generatePrintHTML = (title: string, content: string): string => {
  return `
<!DOCTYPE html>
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
</html>
  `.trim();
};

/**
 * Generate and print check-in sheet
 */
export const generateCheckInSheet = (classInfo: ReportClassInfo, entries: Entry[]): void => {
  try {
    // Create props for CheckInSheet component
    const props: CheckInSheetProps = {
      classInfo,
      entries
    };

    // Render component to HTML string
    const componentHTML = ReactDOMServer.renderToStaticMarkup(
      React.createElement(CheckInSheet, props)
    );

    // Generate complete HTML document
    const htmlDoc = generatePrintHTML(
      `${classInfo.element} ${classInfo.level} Check-in Sheet`,
      componentHTML
    );

    // Open new window and write HTML
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlDoc);
      printWindow.document.close();
    } else {
      logger.error('Failed to open print window. Please check popup blocker settings.');
      alert('Unable to open print window. Please check your browser\'s popup blocker settings.');
    }
  } catch (error) {
    logger.error('Error generating check-in sheet:', error);
    alert('Error generating check-in sheet. Please try again.');
  }
};

/**
 * Generate and print results sheet
 */
export const generateResultsSheet = (classInfo: ReportClassInfo, entries: Entry[]): void => {
  try {
    // Filter to only scored entries
    const scoredEntries = entries.filter(entry => entry.isScored);

    if (scoredEntries.length === 0) {
      alert('No scored entries to display in results sheet.');
      return;
    }

    // Create props for ResultsSheet component
    const props: ResultsSheetProps = {
      classInfo,
      entries: scoredEntries
    };

    // Render component to HTML string
    const componentHTML = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResultsSheet, props)
    );

    // Generate complete HTML document
    const htmlDoc = generatePrintHTML(
      `${classInfo.element} ${classInfo.level} Results`,
      componentHTML
    );

    // Open new window and write HTML
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlDoc);
      printWindow.document.close();
    } else {
      logger.error('Failed to open print window. Please check popup blocker settings.');
      alert('Unable to open print window. Please check your browser\'s popup blocker settings.');
    }
  } catch (error) {
    logger.error('Error generating results sheet:', error);
    alert('Error generating results sheet. Please try again.');
  }
};

/**
 * Generate and print dog results report
 */
export const generateDogResultsSheet = (dogInfo: DogResultsSheetProps['dogInfo'], results: DogResultsSheetProps['results'], showName?: string, organization?: string): void => {
  try {
    if (results.length === 0) {
      alert('No results to display in dog results report.');
      return;
    }

    // Create props for DogResultsSheet component
    const props: DogResultsSheetProps = {
      dogInfo,
      results,
      showName,
      organization
    };

    // Render component to HTML string
    const componentHTML = ReactDOMServer.renderToStaticMarkup(
      React.createElement(DogResultsSheet, props)
    );

    // Generate complete HTML document
    const htmlDoc = generatePrintHTML(
      `${dogInfo.callName} - Performance Report`,
      componentHTML
    );

    // Open new window and write HTML
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlDoc);
      printWindow.document.close();
    } else {
      logger.error('Failed to open print window. Please check popup blocker settings.');
      alert('Unable to open print window. Please check your browser\'s popup blocker settings.');
    }
  } catch (error) {
    logger.error('Error generating dog results sheet:', error);
    alert('Error generating dog results sheet. Please try again.');
  }
};

/**
 * Extended class info for scoresheet (includes time limits)
 */
export interface ScoresheetClassInfo extends ReportClassInfo {
  timeLimitSeconds?: number;
  timeLimitArea2Seconds?: number;
  timeLimitArea3Seconds?: number;
  areaCount?: number;
  // Class requirements from database (pre-filled for Novice/Advanced/Excellent, blank for Master)
  hidesText?: string;       // e.g., "1", "2", "3", "1-4"
  distractionsText?: string; // e.g., "None", "Non-food", "Various"
}

/**
 * Generate and print judge's scoresheet
 * Blank scoresheet for judges to record scores during trial
 */
export const generateScoresheetReport = (classInfo: ScoresheetClassInfo, entries: Entry[]): void => {
  try {
    if (entries.length === 0) {
      alert('No entries to display in scoresheet.');
      return;
    }

    // Create props for ScoresheetReport component
    const props: ScoresheetReportProps = {
      classInfo,
      entries
    };

    // Render component to HTML string
    const componentHTML = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ScoresheetReport, props)
    );

    // Generate complete HTML document
    const htmlDoc = generatePrintHTML(
      `${classInfo.element} ${classInfo.level} Scoresheet`,
      componentHTML
    );

    // Open new window and write HTML
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(htmlDoc);
      printWindow.document.close();
    } else {
      logger.error('Failed to open print window. Please check popup blocker settings.');
      alert('Unable to open print window. Please check your browser\'s popup blocker settings.');
    }
  } catch (error) {
    logger.error('Error generating scoresheet:', error);
    alert('Error generating scoresheet. Please try again.');
  }
};
