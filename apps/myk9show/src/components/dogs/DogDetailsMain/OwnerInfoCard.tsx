import React, { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { OwnerInfoCardProps } from './types';

const OwnerInfoCard: React.FC<OwnerInfoCardProps> = ({ dog, owner }) => {
  const navigate = useNavigate();

  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
      />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl">
            <UserIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Owner Information
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-5">
          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Owner Name
            </span>
            {owner.id !== 'unknown' ? (
              <span
                className="text-sm font-medium text-primary hover:text-primary/80
                           transition-colors duration-200 hover:underline cursor-pointer"
                onClick={() =>
                  startTransition(() => navigate(`/people/${owner.id}?fromDog=${dog.id}`))
                }
              >
                {owner.name}
              </span>
            ) : (
              <span className="text-sm font-medium text-foreground">{owner.name}</span>
            )}
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Email
            </span>
            {owner.email && owner.email !== 'N/A' ? (
              <a
                href={`mailto:${owner.email}`}
                className="text-sm font-medium text-primary hover:text-primary/80
                         transition-colors duration-200 hover:underline"
              >
                {owner.email}
              </a>
            ) : (
              <span className="text-sm font-medium text-foreground">Not provided</span>
            )}
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Phone
            </span>
            {owner.phone && owner.phone !== 'N/A' ? (
              <a
                href={`tel:${owner.phone.replace(/[^\d]/g, '')}`}
                className="text-sm font-medium text-primary hover:text-primary/80
                         transition-colors duration-200 hover:underline"
              >
                {owner.phone}
              </a>
            ) : (
              <span className="text-sm font-medium text-foreground">Not provided</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default OwnerInfoCard;
