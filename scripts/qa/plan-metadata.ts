import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PlanDiagnostic {
  file: string;
  code: 'missing-status' | 'missing-index';
  message: string;
}

function resolveIndexLink(docs: string, href: string): string | undefined {
  try {
    return resolve(docs, decodeURIComponent(href));
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

/** Only living top-level docs/plan-*.md; archives and nested specs retain their formats. */
export function checkPlanMetadata(root: string): PlanDiagnostic[] {
  const docs = resolve(root, 'docs');
  const index = readFileSync(resolve(docs, 'README.md'), 'utf8');
  const links = new Set(
    [...index.matchAll(/\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)]
      .map(match => match[1]!.split('#')[0]!)
      .filter(href => !/^[a-z][a-z\d+.-]*:|^\/\//i.test(href))
      .map(href => resolveIndexLink(docs, href))
      .filter((href): href is string => href !== undefined)
  );
  const diagnostics: PlanDiagnostic[] = [];
  for (const file of readdirSync(docs)
    .filter(file => /^plan-.*\.md$/.test(file))
    .sort()) {
    const text = readFileSync(resolve(docs, file), 'utf8');
    if (!/^# [^\n]+\r?\n\s*\r?\n> \*\*Status:\*\* (?:Active|Complete|Abandoned)\b/.test(text)) {
      diagnostics.push({
        file: `docs/${file}`,
        code: 'missing-status',
        message: 'Add canonical Active, Complete or Abandoned status immediately after title.',
      });
    }
    if (!links.has(resolve(docs, file))) {
      diagnostics.push({
        file: `docs/${file}`,
        code: 'missing-index',
        message: 'Add a resolving Markdown link in docs/README.md.',
      });
    }
  }
  return diagnostics;
}

if (process.argv[1]?.endsWith('/plan-metadata.ts')) {
  const diagnostics = checkPlanMetadata(resolve(process.argv[2] ?? '.'));
  if (diagnostics.length) {
    console.error(JSON.stringify(diagnostics, null, 2));
    process.exitCode = 1;
  } else
    console.log('Plan metadata: all top-level living plans have canonical status and index links.');
}
