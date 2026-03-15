import { cn } from '@/lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function PageShell({ children, maxWidth = 'max-w-7xl', className }: PageShellProps) {
  return (
    <div className={cn(maxWidth, 'mx-auto px-4 sm:px-6 py-6 space-y-6 bg-background', className)}>
      {children}
    </div>
  );
}
