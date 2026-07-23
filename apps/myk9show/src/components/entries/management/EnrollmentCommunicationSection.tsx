import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/utils/format';

interface EnrollmentCommunicationSectionProps {
  lastDecisionEmailedAt: string | undefined;
  canSendDecisionEmail: boolean;
  onEmail: () => void;
}

export function EnrollmentCommunicationSection({
  lastDecisionEmailedAt,
  canSendDecisionEmail,
  onEmail,
}: EnrollmentCommunicationSectionProps) {
  return (
    <section
      className="border-t border-border/60 px-4 py-3"
      aria-labelledby="focused-registration-communication"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="focused-registration-communication" className="font-semibold">
            Communication and history
          </h3>
          <p className="text-sm text-muted-foreground">
            {lastDecisionEmailedAt
              ? `Decision emailed ${formatRelativeTime(new Date(lastDecisionEmailedAt))}`
              : 'No decision email sent yet'}
          </p>
        </div>
        {canSendDecisionEmail && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={onEmail}
            title="Send decision email to exhibitor"
          >
            <Mail className="h-4 w-4" aria-hidden />
            Email Exhibitor
          </Button>
        )}
      </div>
    </section>
  );
}
