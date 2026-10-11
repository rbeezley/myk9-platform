/** Max-time entry parsing for the ringside Set Max Time dialog. */

/**
 * What a judge types → seconds. The iPhone numeric pad has no colon, so besides
 * "4:30" accept "4.30", "430" and a bare "4" (one or two digits are minutes).
 */
export function parseMaxTimeInput(raw: string): number | null {
  const text = raw.trim();
  const separated = /^(\d{1,2})[:.](\d{2})$/.exec(text);
  if (separated) return Number(separated[1]) * 60 + Number(separated[2]);
  if (/^\d{1,2}$/.test(text)) return Number(text) * 60;
  const packed = /^(\d{1,2})(\d{2})$/.exec(text);
  if (packed) return Number(packed[1]) * 60 + Number(packed[2]);
  return null;
}
