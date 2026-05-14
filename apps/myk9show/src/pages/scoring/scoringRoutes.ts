export function getPaperScoringClassHref(classId: string): string {
  return `/scoring/classes/${classId}/entries?mode=split`;
}

export function getPaperScoringEntryHref(classId: string, entryId: string): string {
  const params = new URLSearchParams({ entryId, mode: 'split' });
  return `/scoring/classes/${classId}/entries?${params.toString()}`;
}
