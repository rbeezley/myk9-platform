import { cn } from '@/lib/utils';
import { AppShellPage } from '@/components/layout/AppShell';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function PageShell({ children, maxWidth = 'max-w-7xl', className }: PageShellProps) {
  return (
    <AppShellPage maxWidthClass={maxWidth} className={cn('space-y-6', className)}>
      {children}
    </AppShellPage>
  );
}
