/**
 * Every CLAUDE.md LESSONS bullet links a narrative section in
 * docs/lessons/README.md. That section carries one `**Guard:**` line naming
 * what catches the trap (MYK9-1651):
 *
 *   **Guard:** `<repo-relative path of the program that catches it>`
 *   **Guard:** MYK9-<n> (check not built yet)
 *   **Guard:** human-only: <why no program can catch it>
 *
 * `MYK9-TBD-<anchor>` is the placeholder used before an issue is filed; it is
 * rejected so a branch carrying one cannot ship.
 */

export interface GuardCheckInput {
  anchors: string[];
  narratives: string;
  fileExists: (repoRelativePath: string) => boolean;
}

/** Section body: from the `## slug` heading to the next heading of level 1 or 2. */
export const sectionFor = (narratives: string, slug: string): string | null => {
  const lines = narratives.split('\n');
  const start = lines.findIndex(l => l === `## ${slug}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,2} /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
};

/** Returns one problem string per lesson whose Guard line is missing or invalid. */
export const lessonGuardProblems = ({
  anchors,
  narratives,
  fileExists,
}: GuardCheckInput): string[] => {
  const problems: string[] = [];
  for (const slug of anchors) {
    const section = sectionFor(narratives, slug);
    if (section === null) {
      problems.push(`${slug}: no narrative section`);
      continue;
    }
    const guards = section.split('\n').filter(l => l.startsWith('**Guard:**'));
    if (guards.length !== 1) {
      problems.push(`${slug}: expected exactly one **Guard:** line, found ${guards.length}`);
      continue;
    }
    const value = guards[0].slice('**Guard:**'.length).trim();
    const path = value.match(/^`([^`\s]+)`$/)?.[1];
    if (path !== undefined) {
      if (!fileExists(path)) problems.push(`${slug}: guard file does not exist: ${path}`);
    } else if (/^MYK9-\d+( \(check not built yet\))?$/.test(value)) {
      // a filed issue to build the check
    } else if (/^human-only: \S.*$/.test(value)) {
      // stated explicitly
    } else {
      problems.push(`${slug}: unrecognized or placeholder guard: ${value}`);
    }
  }
  return problems;
};
