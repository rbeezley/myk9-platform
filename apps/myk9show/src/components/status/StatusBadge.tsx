import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { StatusIcon } from './StatusIcon';
import { getStatusDescriptor, type StatusFamily } from './statusIconGrammar';

interface StatusBadgeProps extends Omit<ComponentProps<typeof Badge>, 'children'> {
  family: StatusFamily;
  status?: string | null | undefined;
  label?: string | undefined;
}

export function StatusBadge({ family, status, label, className, ...badgeProps }: StatusBadgeProps) {
  const descriptor = getStatusDescriptor(family, status);

  return (
    <Badge className={cn('inline-flex items-center gap-1.5', className)} {...badgeProps}>
      <StatusIcon family={family} status={status} size="sm" decorative />
      <span>{label ?? descriptor.label}</span>
    </Badge>
  );
}
