const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string | number | null | undefined): string {
  if (value == null) {
    return '';
  }

  return String(value).replace(/[&<>"']/g, char => HTML_ESCAPE_MAP[char] ?? char);
}
