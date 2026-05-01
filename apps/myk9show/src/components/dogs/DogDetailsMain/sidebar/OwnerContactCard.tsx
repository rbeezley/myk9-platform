import React from 'react';
import { Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Owner } from '@/types/dog-types';

interface OwnerContactCardProps {
  owner: Owner;
  /** Secretary view uses a teal accent border and "Primary contact" eyebrow */
  prominent?: boolean;
}

const OwnerContactCard: React.FC<OwnerContactCardProps> = ({ owner, prominent = false }) => (
  <Card className={cn(prominent && 'border-teal-400 dark:border-teal-600')}>
    <CardHeader className="pb-1 pt-4 px-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {prominent ? 'Primary contact' : 'Owner contact'}
      </span>
    </CardHeader>
    <CardContent className="px-4 pb-4 space-y-2">
      {owner.id === 'loading' ? (
        <span className="text-sm font-semibold text-muted-foreground">{owner.name}</span>
      ) : owner.id !== 'unknown' ? (
        <Link
          to={`/people/${owner.id}`}
          className="text-sm font-semibold hover:text-primary transition-colors"
        >
          {owner.name}
        </Link>
      ) : (
        <span className="text-sm font-semibold">{owner.name}</span>
      )}
      {owner.email && owner.email !== 'N/A' && (
        <a
          href={`mailto:${owner.email}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
          {owner.email}
        </a>
      )}
      {owner.phone && owner.phone !== 'N/A' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          {owner.phone}
        </div>
      )}
    </CardContent>
  </Card>
);

export default OwnerContactCard;
