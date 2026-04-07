import { REPORT_STYLES } from './reportStyles';

/**
 * Wraps static HTML report content in a complete HTML document with the
 * inlined print stylesheet.
 *
 * Used to write into an iframe for WYSIWYG preview. The stylesheet must be
 * inlined because dynamically-written iframes cannot load external CSS files.
 *
 * @param content - Static HTML string (e.g. from ReactDOMServer.renderToStaticMarkup)
 * @returns Complete HTML document string ready to be written into an iframe
 */
export function renderReportToHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Report Preview</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  ${content}
</body>
</html>`;
}
