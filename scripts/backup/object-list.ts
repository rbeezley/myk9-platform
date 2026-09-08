/** AWS may emit no JSON for a successful listing of an empty prefix. */
export function parseObjectList(raw: string): {
  Contents?: Array<{ Key?: string; LastModified?: string }>;
} {
  return JSON.parse(raw.trim() || '{}');
}
