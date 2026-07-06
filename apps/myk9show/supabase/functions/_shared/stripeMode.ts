export function isStripeLiveMode(stripeSecret: string | null | undefined): boolean {
  return typeof stripeSecret === 'string' && stripeSecret.startsWith('sk_live');
}
