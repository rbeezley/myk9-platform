/** Convert a 1-indexed integer to its lowercase roman equivalent (caps at viii
 *  for layout safety; falls back to arabic past 8). */
export function toLowerRoman(n: number): string {
  const map = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
  if (n < 1) return String(n);
  if (n > map.length) return String(n);
  return map[n - 1]!;
}
