import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AssociationConfig } from './RecordPageLayout.types';

interface AssociationCardProps {
  association: AssociationConfig;
}

export function AssociationCard({ association }: AssociationCardProps) {
  const navigate = useNavigate();
  const Icon = association.icon;

  const handleClick = () => {
    if (association.onClick) {
      association.onClick();
    } else if (association.href) {
      startTransition(() => navigate(association.href as string));
    }
  };

  const isClickable = !!(association.href || association.onClick);

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card/95 p-3 space-y-1.5 transition-all duration-200',
        isClickable && 'hover:shadow-sm hover:border-primary/20 cursor-pointer'
      )}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'link' : undefined}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
        )}
        <span className="text-sm font-semibold truncate flex-1">{association.title}</span>
        {association.badge && <Badge variant="secondary">{association.badge}</Badge>}
        {isClickable && <ArrowUpRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      </div>
      {association.subtitle && (
        <p className="text-xs text-muted-foreground line-clamp-2">{association.subtitle}</p>
      )}
    </div>
  );
}
