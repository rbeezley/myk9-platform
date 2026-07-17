import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { getStatusDescriptor, type StatusFamily, type StatusShape } from './statusIconGrammar';

const SHAPE_ICONS: Record<StatusShape, LucideIcon> = {
  'not-started': CircleDashed,
  pending: Circle,
  'in-progress': CircleDot,
  complete: CircleCheck,
  'needs-attention': TriangleAlert,
};

export interface StatusIconProps {
  family: StatusFamily;
  status?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  decorative?: boolean | undefined;
  className?: string | undefined;
}

const SIZE_CLASSES: Record<NonNullable<StatusIconProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function StatusIcon({
  family,
  status,
  size = 'md',
  decorative = false,
  className,
}: StatusIconProps) {
  const statusDescriptor = getStatusDescriptor(family, status);
  const Icon = SHAPE_ICONS[statusDescriptor.shape];

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : statusDescriptor.label}
      data-family={family}
      data-status={statusDescriptor.status}
      data-shape={statusDescriptor.shape}
      className={cn('inline-flex shrink-0', statusDescriptor.colorClass, className)}
    >
      <Icon className={SIZE_CLASSES[size]} aria-hidden="true" />
    </span>
  );
}
