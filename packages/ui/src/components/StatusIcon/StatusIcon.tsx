import { cn } from '../../utils/cn';
import { getStatusDescriptor, type StatusFamily, type StatusShape } from './statusIconGrammar';

function StatusGlyph({ shape, className }: { shape: StatusShape; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shape === 'not-started' && <circle cx="12" cy="12" r="9" strokeDasharray="4 3" />}
      {shape === 'pending' && <circle cx="12" cy="12" r="9" />}
      {shape === 'in-progress' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </>
      )}
      {shape === 'complete' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      )}
      {shape === 'needs-attention' && (
        <>
          <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      )}
    </svg>
  );
}

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
      <StatusGlyph shape={statusDescriptor.shape} className={SIZE_CLASSES[size]} />
    </span>
  );
}
