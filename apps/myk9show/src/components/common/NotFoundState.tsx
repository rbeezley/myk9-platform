import { FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NotFoundStateProps {
  entityName: string;
  backTo: string;
  backLabel: string;
  className?: string;
}

export function NotFoundState({ entityName, backTo, backLabel, className }: NotFoundStateProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[50vh] text-center',
        className,
      )}
    >
      <div className="bg-muted rounded-full p-4 mb-4">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{entityName} Not Found</h3>
      <p className="text-muted-foreground mb-6">
        The {entityName.toLowerCase()} you&apos;re looking for doesn&apos;t exist or has been
        removed.
      </p>
      <button
        onClick={() => navigate(backTo)}
        className="h-12 px-6 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {backLabel}
      </button>
    </div>
  );
}
