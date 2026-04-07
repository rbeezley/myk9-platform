import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import DelightfulError from '@/components/ui/DelightfulError';
import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';
import type { EntryAgreementSectionProps } from './types';

export const EntryAgreementSection = ({
  organization,
  agreed,
  onAgree,
}: EntryAgreementSectionProps) => {
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
      <DelightfulError variant="inline" message="Failed to load entry agreement." reset={refetch} />
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
