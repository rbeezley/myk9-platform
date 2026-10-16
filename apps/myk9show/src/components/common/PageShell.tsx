import { cn } from '@/lib/utils';
import { AppShellPage } from '@/components/layout/AppShell';
import { useEmbeddedDetail } from '@/components/layout/embeddedDetail';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  /**
   * Wraps the page's content inside the shell's padding (a Browse list passes `BrowseTabs`).
   * A prop, not an import here: every page imports this shell, auth's own module graph included.
   */
  ContentWrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

export function PageShell({
  children,
  maxWidth = 'max-w-7xl',
  className,
  ContentWrapper,
}: PageShellProps) {
  const content = ContentWrapper ? <ContentWrapper>{children}</ContentWrapper> : children;
  // Inside a master-detail pane the page chrome already exists around us; a second
  // `app-shell-page` surface would double the padding and duplicate its test id.
  if (useEmbeddedDetail()) {
    return <div className={cn('space-y-6', className)}>{content}</div>;
  }
  return (
    <AppShellPage maxWidthClass={maxWidth} className={cn('space-y-6', className)}>
      {content}
    </AppShellPage>
  );
}
