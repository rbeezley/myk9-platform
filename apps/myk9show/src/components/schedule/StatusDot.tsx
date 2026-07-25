import type { ClassStatusValue } from '@myk9/core';
import { StatusIcon } from '@/components/status';

interface StatusDotProps {
  status: ClassStatusValue;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return <StatusIcon family="class" status={status} size="sm" className={className} />;
}
