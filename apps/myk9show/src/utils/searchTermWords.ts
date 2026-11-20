/**
 * MYK9-2148: the words of a typed search. Spaces, commas and parentheses all
 * separate words, so "Smith, Mary" and "Rex (CH)" are matched word by word the
 * same as "Smith Mary" and "Rex CH". A secretary often writes an owner as
 * "Last, First"; keeping the comma on "Smith," would match no field.
 *
 * Shared by the device-side dog matcher and the server search, so the two
 * never disagree about which dogs a search finds.
 */
export function searchTermWords(term: string): string[] {
  return term.split(/[\s,()]+/).filter(Boolean);
}
