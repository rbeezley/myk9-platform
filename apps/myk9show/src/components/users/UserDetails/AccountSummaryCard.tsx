import React from 'react';
import { Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { User as UserType } from '@/types/dog-types';

interface AccountSummaryCardProps {
  person: UserType;
  dogCount: number;
}

const AccountSummaryCard: React.FC<AccountSummaryCardProps> = ({ person, dogCount }) => {
  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
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
            <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Account Summary
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Member Since
            </span>
            <span className="text-lg font-semibold text-foreground">
              {person.createdAt
                ? new Date(person.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Not available'}
            </span>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Account Status
            </span>
            <Badge
              className="bg-gradient-to-r from-green-500/20 to-green-500/10
                            text-green-700 dark:text-green-300 border border-green-500/30 font-medium"
            >
              Active
            </Badge>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Dogs Registered
            </span>
            <span className="text-lg font-semibold text-foreground">{dogCount} dogs</span>
          </div>

          <div
            className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300"
          >
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              User ID
            </span>
            <span className="text-xs font-mono bg-muted/50 px-2 py-1 rounded-md text-foreground break-all">
              {person.id}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AccountSummaryCard;
