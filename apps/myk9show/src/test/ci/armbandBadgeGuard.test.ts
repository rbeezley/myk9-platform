// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { relativePosix } from '@/test/utils/posixPath';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-2491 / MYK9-2534: a standalone armband display renders `ArmbandBadge`
 * (the square accent-colour badge), never `#{...armband...}` or
 * `Armband {...}` typed into JSX text. This guard reads every `.tsx` file under
 * src and fails on those ad-hoc forms outside ArmbandBadge.tsx and the
 * allowlist below. Test files are skipped.
 *
 * To fix a failure: render `<ArmbandBadge armband={...} />` (add `srLabel` where
 * the bare number would be unclear). Add to the allowlist only for an armband
 * inside a sentence, a printed label/PDF or an email template, with the reason.
 */
const SRC = resolve(__dirname, '../..');

const AD_HOC_ARMBAND = [
  /#\s*\{[^}]*armband[^}]*\}/i, // #{entry.armband}, #{formatArmband(entry)}
  /\bArmband:?\s*\{(?!\s*['"`]\s*['"`]\s*\})[^}]*\}/, // Armband {x}; not the {' '} spacer before a badge
  /\bArmband:\s*<\/\w+>\s*\{[^}]*\}/, // <strong>Armband:</strong> {x}
  /`[^`]*\bArmband\s*\$\{[^}]*\}/, // `Armband ${x} ${dogName}`
  /<(?:td|TableCell)\b[^>]*>\s*\{[^{}<>]*armband[^{}<>]*\}\s*<\/(?:td|TableCell)>/i, // bare cell: <TableCell>{entry.armband}</TableCell>
];

const PRINTED_DOCUMENT =
  'Printed report or catalog table (print/PDF layout), out of scope per MYK9-2534.';

/** Paths relative to src/, with the reason each is allowed to print the armband as text. */
const ALLOWLIST: Record<string, string> = {
  'components/common/ArmbandBadge.tsx': 'The badge itself.',
  'components/reports/labels/ResultLabelCell.tsx':
    'Printed result label branch; the on-screen preview passes `screen` and renders the badge (unassigned keeps the printed text so it stays readable on the white sheet).',
  'components/reports/AKCScentWorkTransferFormPreview.tsx': PRINTED_DOCUMENT,
  'components/reports/AkcMarkedCatalogClass.tsx': PRINTED_DOCUMENT,
  'components/reports/FinancialReport.tsx': PRINTED_DOCUMENT,
  'components/reports/HighInTrialReport.tsx': PRINTED_DOCUMENT,
  'components/reports/ResultCatalog.tsx': PRINTED_DOCUMENT,
  'components/reports/ResultsSheet.tsx': PRINTED_DOCUMENT,
  'components/reports/ShowCatalog.tsx': PRINTED_DOCUMENT,
  'features/pipeline/print/print-templates.tsx': PRINTED_DOCUMENT,
  'components/reports/PrintableReport.tsx':
    'Printable report (print/PDF layout): a plain-text document, not an on-screen badge.',
  'components/reports/labels/ArmbandLabelChoiceControls.tsx':
    'In a sentence ("For Rex #12, for Saturday") describing which labels will print.',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const full = join(dir, item.name);
    if (item.isDirectory()) return item.name === 'node_modules' ? [] : walk(full);
    return item.name.endsWith('.tsx') ? [full] : [];
  });
}

const isTestFile = (rel: string) => /\.test\.tsx$/.test(rel) || rel.includes('/__tests__/');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function findAdHocArmband(source: string): string[] {
  // aria-label values are accessible names, not visible text.
  const text = stripComments(source).replace(/aria-label=(?:\{[^}]*\}|"[^"]*")/g, '');
  return AD_HOC_ARMBAND.flatMap(
    pattern => text.match(new RegExp(pattern.source, `${pattern.flags}g`)) ?? []
  );
}

describe('armband badge guard', () => {
  it('flags the ad-hoc forms (known-answer fixtures)', () => {
    expect(findAdHocArmband('<span>#{entry.armband}</span>')).toHaveLength(1);
    expect(findAdHocArmband('<span>Armband {entry.armband}</span>')).toHaveLength(1);
    expect(findAdHocArmband('<strong>Armband:</strong> {entry.armband}')).toHaveLength(1);
    expect(findAdHocArmband('<span>#{formatArmband(entry)}</span>')).toHaveLength(1);
    expect(findAdHocArmband('<TableCell>{entry.armband || "-"}</TableCell>')).toHaveLength(1);
    expect(findAdHocArmband('`Armband ${entry.armband} ${entry.dogName}`')).toHaveLength(1);
    expect(findAdHocArmband('<b aria-label={`Armband ${entry.armband}`} />')).toHaveLength(0);
    expect(findAdHocArmband('<ArmbandBadge armband={entry.armband} />')).toHaveLength(0);
    expect(findAdHocArmband('// #{entry.armband}\n<span>{count}</span>')).toHaveLength(0);
  });

  it('renders no armband as ad-hoc text outside the allowlist', () => {
    const offenders = walk(SRC)
      .map(file => relativePosix(SRC, file))
      .filter(rel => !isTestFile(rel) && !(rel in ALLOWLIST))
      .filter(rel => findAdHocArmband(readFileSync(join(SRC, rel), 'utf8')).length > 0);
    expect(offenders).toEqual([]);
  });

  it('keeps every allowlist entry real and needed', () => {
    const stale = Object.keys(ALLOWLIST).filter(rel => {
      if (rel === 'components/common/ArmbandBadge.tsx') return false;
      return findAdHocArmband(readFileSync(join(SRC, rel), 'utf8')).length === 0;
    });
    expect(stale).toEqual([]);
  });
});
