/** Resolve the client address using headers supplied by the edge proxy. */
export function getClientIP(req: Request): string | null {
  const cfIP = req.headers.get('cf-connecting-ip');
  if (cfIP?.trim()) return cfIP.trim();

  const realIP = req.headers.get('x-real-ip');
  if (realIP?.trim()) return realIP.trim();

  // X-Forwarded-For is caller-controlled unless the edge proxy overwrites it.
  // Do not use an arbitrary hop as an identity when trusted headers are absent.
  return null;
}
