import { cn } from '@/lib/utils';

interface SpineLineProps {
  className?: string;
}

export function SpineLine({ className }: SpineLineProps) {
  return <div className={cn('w-0.5 flex-1 bg-border', className)} />;
}
