import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
  /**
   * What the reader should do about it. Defaults to the connection advice,
   * which is wrong (and faintly insulting) for a permission or server error —
   * pass the real reason when the caller knows it.
   */
  description?: string;
  headingLevel?: 1 | 2 | 3;
}

export function ErrorState({
  message,
  onRetry,
  className,
  description = 'Check your connection and try again.',
  headingLevel = 3,
}: ErrorStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center py-16 text-center', className)}
    >
      <div className="bg-destructive/10 rounded-full p-4 mb-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <Heading className="text-lg font-semibold mb-2">{message}</Heading>
      <p className="text-muted-foreground mb-6">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="h-12 px-6 text-base font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
