interface HeroBadge {
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'default';
}

/** Map a status string to a HeroBadge variant. */
const STATUS_VARIANT_MAP: Record<string, HeroBadge['variant']> = {
  'In Progress': 'warning',
  Completed: 'success',
};

export function getStatusBadge(status: string | undefined): HeroBadge | undefined {
  if (!status) return undefined;
  return { label: status, variant: STATUS_VARIANT_MAP[status] || 'default' };
}
