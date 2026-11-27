import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ExhibitorEmailHistory,
  type ExhibitorEmailResend,
} from '@/features/email-delivery-history';
import { formatRelativeTime } from '@/utils/format';

interface EnrollmentCommunicationSectionProps {
  lastDecisionEmailedAt: string | undefined;
  canSendDecisionEmail: boolean;
  onEmail: () => void;
  /** The show and exhibitor address the delivery history is read for (MYK9-2403). */
  showId: string | undefined;
  exhibitorEmail: string;
  resend?: ExhibitorEmailResend | undefined;
}

export function EnrollmentCommunicationSection({
  lastDecisionEmailedAt,
  canSendDecisionEmail,
  onEmail,
  showId,
  exhibitorEmail,
  resend,
}: EnrollmentCommunicationSectionProps) {
  // MYK9-2483: with no address on file a send cannot arrive, so offer none and say why here,
  // the one place this section explains it.
  const hasEmail = exhibitorEmail.trim().length > 0;
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
          {lastDecisionEmailedAt && (
            <p className="text-sm text-muted-foreground">
              {`Decision emailed ${formatRelativeTime(new Date(lastDecisionEmailedAt))}`}
            </p>
          )}
        </div>
        {canSendDecisionEmail && hasEmail && (
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
      {!hasEmail ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This exhibitor has no email address on file, so an email cannot reach them. Let them know
          another way.
        </p>
      ) : (
        showId && (
          <ExhibitorEmailHistory showId={showId} recipientEmail={exhibitorEmail} resend={resend} />
        )
      )}
    </section>
  );
}
