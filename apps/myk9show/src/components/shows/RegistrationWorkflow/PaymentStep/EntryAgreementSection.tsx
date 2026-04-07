import React from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';
import type { EntryAgreementSectionProps } from './types';

export const EntryAgreementSection: React.FC<EntryAgreementSectionProps> = ({
  organization,
  agreed,
  onAgree,
}) => {
  const { data, isLoading, isError, refetch } = useOrganizationAgreement(organization);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="agreement-skeleton">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-destructive">Failed to load entry agreement.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/50 px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
          <span>{organization} Entry Agreement</span>
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 max-h-[300px] overflow-y-auto rounded-md border bg-background p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {data.agreement_text}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-start gap-2">
        <Checkbox
          id="entry-agreement"
          checked={agreed}
          onCheckedChange={onAgree}
          className="mt-1"
        />
        <Label htmlFor="entry-agreement" className="text-sm text-muted-foreground cursor-pointer">
          I have read and agree to the {organization} entry agreement above.
        </Label>
      </div>
    </div>
  );
};
