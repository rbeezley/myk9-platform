import { type Dog, getDogBreedLabel } from '@/types/dog-types';
import { searchTermWords } from '@/utils/searchTermWords';

/**
 * Every text field the dog search reads: call name, name, owner name, each
 * registration's registered name and number, breed and microchip. Lowercased,
 * blanks dropped.
 */
export function dogSearchFields(dog: Dog): string[] {
  return [
    dog.callName,
    dog.name,
    dog.ownerName,
    ...(dog.registrations ?? []).flatMap(reg => [reg.registeredName, reg.registrationNumber]),
    getDogBreedLabel(dog),
    dog.microchip,
  ]
    .filter((field): field is string => typeof field === 'string' && field.trim() !== '')
    .map(field => field.toLowerCase());
}

/**
 * MYK9-2020: the one rule for whether a dog matches the search box. The query
 * is split on spaces, commas and parentheses (MYK9-2148), and the dog matches when EVERY word appears (as a
 * case-insensitive substring, so a prefix counts) in at least one of its
 * fields. "Mary Ja Smith" matches owner "Mary Jane Smith"; "rex lab" matches
 * call name Rex with breed Labrador. A blank query matches every dog.
 */
export function matchesDogSearch(dog: Dog, query: string): boolean {
  const words = searchTermWords(query.toLowerCase());
  if (words.length === 0) return true;
  const fields = dogSearchFields(dog);
  return words.every(word => fields.some(field => field.includes(word)));
}
