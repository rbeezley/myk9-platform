import type { PageEntry } from '../types';

const CALLBACK_NAME = '__myk9FlowNav';

export function sanitizePath(path: string): string {
  const result = path.replace(/^\//, '').replace(/[/:]/g, '_');
  return result || 'root';
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, '&quot;');
}

export function buildMermaidGraph(pages: PageEntry[]): string {
  if (pages.length === 0) return '';

  const pathSet = new Set(pages.map(p => p.path));
  const lines: string[] = ['flowchart LR'];

  // Node definitions + click directives
  for (const page of pages) {
    const id = sanitizePath(page.path);
    const label = `${escapeLabel(page.title)}<br/>${escapeLabel(page.path)}`;
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  click ${id} "${CALLBACK_NAME}"`);
  }

  // Edge definitions — only when both endpoints are in the filtered set
  for (const page of pages) {
    const sourceId = sanitizePath(page.path);
    for (const target of page.linksTo ?? []) {
      if (pathSet.has(target)) {
        lines.push(`  ${sourceId} --> ${sanitizePath(target)}`);
      }
    }
  }

  return lines.join('\n');
}
