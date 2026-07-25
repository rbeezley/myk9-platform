import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { resolveShowDeskReturnHref } from './cockpitRoutes';

export function ShowDeskReturnLink({
  showId,
  className,
}: {
  showId?: string | undefined;
  className?: string;
}) {
  const [searchParams] = useSearchParams();
  const href = resolveShowDeskReturnHref(searchParams.get('returnTo'), showId);
  if (!href) return null;

  return (
    <Link
      to={href}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground',
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to Show Desk
    </Link>
  );
}
