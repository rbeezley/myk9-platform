import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { resolveShowDeskReturn } from './cockpitRoutes';

export function ShowDeskReturnLink({
  showId,
  className,
}: {
  showId?: string | undefined;
  className?: string;
}) {
  const [searchParams] = useSearchParams();
  const target = resolveShowDeskReturn(searchParams.get('returnTo'), showId);
  if (!target) return null;

  return (
    <Link
      to={target.href}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground',
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {target.label}
    </Link>
  );
}
