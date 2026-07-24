export function isOperatorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function boundedOperatorString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .map(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? ' ' : character;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}
