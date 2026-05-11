export function formatJudgeName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Unknown Judge';
  return trimmed
    .replace(/\s*\(\s*-\s*\)\s*$/u, '')
    .replace(/\s*\(\s*\)\s*$/u, '')
    .trim();
}
