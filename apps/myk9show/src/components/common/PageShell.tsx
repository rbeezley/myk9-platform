import { cn } from '@/lib/utils';
import { AppShellPage } from '@/components/layout/AppShell';
import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function PageShell({ children, maxWidth = 'max-w-7xl', className }: PageShellProps) {
  // Inside a master-detail pane the page chrome already exists around us; a second
  // `app-shell-page` surface would double the padding and duplicate its test id.
  if (useEmbeddedDetail()) {
    return <div className={cn('space-y-6', className)}>{children}</div>;
  }
  return (
    <AppShellPage maxWidthClass={maxWidth} className={cn('space-y-6', className)}>
      {children}
    </AppShellPage>
  );
}
