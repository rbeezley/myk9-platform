import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center py-16 text-center', className)}
    >
      <div className="bg-destructive/10 rounded-full p-4 mb-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{message}</h3>
      <p className="text-muted-foreground mb-6">Check your connection and try again.</p>
      <button
        onClick={onRetry}
        className="h-12 px-6 text-base font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
