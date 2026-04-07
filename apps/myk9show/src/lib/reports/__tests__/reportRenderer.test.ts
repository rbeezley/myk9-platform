import { describe, it, expect } from 'vitest';
import { renderReportToHtml } from '../reportRenderer';
import { REPORT_STYLES } from '../reportStyles';

describe('renderReportToHtml', () => {
  it('produces a complete HTML document with DOCTYPE declaration', () => {
    const result = renderReportToHtml('<p>test</p>');
    expect(result).toMatch(/^<!DOCTYPE html>/i);
    expect(result).toContain('<html');
    expect(result).toContain('</html>');
  });

  it('includes opening and closing html tags with lang attribute', () => {
    const result = renderReportToHtml('<p>test</p>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('</html>');
  });

  it('includes head with charset meta and title', () => {
    const result = renderReportToHtml('<p>test</p>');
    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain('<title>Report Preview</title>');
  });

  it('inlines the print stylesheet', () => {
    const result = renderReportToHtml('<p>test</p>');
    expect(result).toContain('<style>');
    expect(result).toContain('</style>');
    // Key @page rule from REPORT_STYLES
    expect(result).toContain('@page');
    expect(result).toContain('size: letter');
  });

  it('inlines the full REPORT_STYLES constant', () => {
    const result = renderReportToHtml('<p>test</p>');
    expect(result).toContain(REPORT_STYLES);
  });

  it('includes the provided content in the body', () => {
    const content = '<div class="report-page"><h1>Results Sheet</h1></div>';
    const result = renderReportToHtml(content);
    expect(result).toContain(content);
  });

  it('wraps content inside body tags', () => {
    const content = '<p>hello</p>';
    const result = renderReportToHtml(content);
    expect(result).toContain(`<body>\n  ${content}\n</body>`);
  });

  it('handles multi-page content with all pages present in output', () => {
    const page1 = '<div class="report-page">Page 1</div>';
    const page2 = '<div class="report-page">Page 2</div>';
    const page3 = '<div class="report-page">Page 3</div>';
    const content = `${page1}${page2}${page3}`;
    const result = renderReportToHtml(content);
    expect(result).toContain('Page 1');
    expect(result).toContain('Page 2');
    expect(result).toContain('Page 3');
  });

  it('handles empty content gracefully', () => {
    const result = renderReportToHtml('');
    expect(result).toMatch(/^<!DOCTYPE html>/i);
    expect(result).toContain('<body>');
    expect(result).toContain('</body>');
  });
});

describe('REPORT_STYLES', () => {
  it('contains @page rule with letter size', () => {
    expect(REPORT_STYLES).toContain('@page');
    expect(REPORT_STYLES).toContain('size: letter');
    expect(REPORT_STYLES).toContain('margin: 0.5in');
  });

  it('contains report-page class with font and color settings', () => {
    expect(REPORT_STYLES).toContain('.report-page');
    expect(REPORT_STYLES).toContain('font-family');
    expect(REPORT_STYLES).toContain('Arial');
    expect(REPORT_STYLES).toContain('#000');
    expect(REPORT_STYLES).toContain('#fff');
  });

  it('contains page-break-before rule for batch mode', () => {
    expect(REPORT_STYLES).toContain('page-break-before: always');
  });

  it('contains report-header and report-logo styles', () => {
    expect(REPORT_STYLES).toContain('.report-header');
    expect(REPORT_STYLES).toContain('.report-logo');
    expect(REPORT_STYLES).toContain('#14b8a6');
  });

  it('contains report-table styles with 11px font', () => {
    expect(REPORT_STYLES).toContain('.report-table');
    expect(REPORT_STYLES).toContain('border-collapse: collapse');
    expect(REPORT_STYLES).toContain('11px');
  });

  it('contains table header styles with gray background', () => {
    expect(REPORT_STYLES).toContain('.report-table th');
    expect(REPORT_STYLES).toContain('#f0f0f0');
    expect(REPORT_STYLES).toContain('uppercase');
    expect(REPORT_STYLES).toContain('10px');
  });

  it('contains alternating row background color', () => {
    expect(REPORT_STYLES).toContain('#fafafa');
  });

  it('contains checkbox-square style', () => {
    expect(REPORT_STYLES).toContain('.checkbox-square');
    expect(REPORT_STYLES).toContain('14px');
  });

  it('contains qualified-text with teal color', () => {
    expect(REPORT_STYLES).toContain('.qualified-text');
    expect(REPORT_STYLES).toContain('#14b8a6');
  });

  it('contains nq-text with red color', () => {
    expect(REPORT_STYLES).toContain('.nq-text');
    expect(REPORT_STYLES).toContain('#ef4444');
  });

  it('contains report-footer with flex layout', () => {
    expect(REPORT_STYLES).toContain('.report-footer');
    expect(REPORT_STYLES).toContain('space-between');
  });

  it('contains scoresheet-specific styles', () => {
    expect(REPORT_STYLES).toContain('.scoresheet-header');
    expect(REPORT_STYLES).toContain('.scoresheet-entries');
    expect(REPORT_STYLES).toContain('.scoresheet-entry-row');
  });

  it('contains media print overrides for color preservation', () => {
    expect(REPORT_STYLES).toContain('@media print');
    expect(REPORT_STYLES).toContain('-webkit-print-color-adjust: exact');
  });
});
