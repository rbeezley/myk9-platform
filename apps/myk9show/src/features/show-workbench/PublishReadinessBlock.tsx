import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Show } from '@/types/show-types';
import { buildPublishReadinessItems } from './publishReadiness';

interface PublishReadinessBlockProps {
  show: Show;
}

export function PublishReadinessBlock({ show }: PublishReadinessBlockProps) {
  const items = buildPublishReadinessItems(show);

  return (
    <section aria-labelledby="publish-readiness-heading" className="space-y-3">
      <div>
        <h2 id="publish-readiness-heading" className="text-lg font-semibold text-foreground">
          Publish readiness
        </h2>
        <p className="text-sm text-muted-foreground">
          Three separate pieces affect what exhibitors can see.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {items.map(item => {
          const Icon = item.isReady ? CheckCircle2 : CircleDashed;
          return (
            <Card key={item.id} className="flex min-h-full flex-col gap-4 p-4">
              <div className="flex items-start gap-3">
                <Icon
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0',
                    item.isReady ? 'text-success' : 'text-warning'
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm font-medium text-foreground">{item.state}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <a
                href={item.href}
                className={buttonVariants({
                  size: 'sm',
                  variant: item.isReady ? 'outline' : 'default',
                  className: 'mt-auto min-h-11 w-full justify-center whitespace-normal text-center',
                })}
              >
                {item.actionLabel}
              </a>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
