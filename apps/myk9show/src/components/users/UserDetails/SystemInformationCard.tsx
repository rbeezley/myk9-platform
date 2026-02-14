import React from 'react';
import { Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { User as UserType } from '@/types/dog-types';

interface SystemInformationCardProps {
  person: UserType;
}

const SystemInformationCard: React.FC<SystemInformationCardProps> = ({ person }) => {
  return (
    <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.01] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
            <Settings className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            System Information
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br
                         from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              User ID
            </span>
            <span className="text-sm font-mono bg-muted/50 px-2 py-1 rounded-md text-foreground">
              {person.id}
            </span>
          </div>

          <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br
                         from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              Account Status
            </span>
            <Badge className="bg-gradient-to-r from-green-500/20 to-green-500/10
                            text-green-700 dark:text-green-300 border-green-500/30 font-medium">
              Active
            </Badge>
          </div>

          {person.user_id && (
            <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br
                           from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Auth ID
              </span>
              <span className="text-sm font-mono bg-muted/50 px-2 py-1 rounded-md text-foreground">
                {person.user_id}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-br
                         from-muted/20 to-muted/10 rounded-xl apple-subtle-card-border">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
              Database Records
            </span>
            <span className="text-sm font-medium text-foreground">
              {person.dogs?.length || 0} associated dogs
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SystemInformationCard;
