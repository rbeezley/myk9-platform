/** A premium must describe only a configured, supported junior tier. */
export function premiumJuniorFee(organization: unknown, fee: unknown): number | null {
  if (organization === 'ASCA' || typeof fee !== 'number' || !Number.isFinite(fee) || fee <= 0) {
    return null;
  }
  return fee;
}
