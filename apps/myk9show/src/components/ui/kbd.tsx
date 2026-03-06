import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'h-4 min-w-[16px] px-1 text-[10px]',
  md: 'h-5 min-w-[20px] px-1.5 text-[10px] font-medium',
  lg: 'h-6 min-w-[24px] px-1.5 text-xs font-medium',
} as const;

interface KbdProps {
  children: React.ReactNode;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function Kbd({ children, size = 'md', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground',
        sizeClasses[size],
        className
      )}
    >
      {children}
    </kbd>
  );
}
