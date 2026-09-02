/** Resolve the client address using headers supplied by the edge proxy. */
export function getClientIP(req: Request): string {
  const cfIP = req.headers.get('cf-connecting-ip');
  if (cfIP?.trim()) return cfIP.trim();

  const realIP = req.headers.get('x-real-ip');
  if (realIP?.trim()) return realIP.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const lastHop = forwarded
      .split(',')
      .map(hop => hop.trim())
      .filter(Boolean)
      .at(-1);
    if (lastHop) return lastHop;
  }

  return 'unknown';
}
