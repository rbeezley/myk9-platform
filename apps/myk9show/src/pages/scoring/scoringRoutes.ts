export function getPaperScoringClassHref(classId: string): string {
  return `/scoring/classes/${encodeURIComponent(classId)}/entries`;
}

export function getPaperScoringEntryHref(classId: string, entryId: string): string {
  const params = new URLSearchParams({ entryId });
  return `/scoring/classes/${encodeURIComponent(classId)}/entries?${params.toString()}`;
}
