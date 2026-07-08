import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { RegistrySubmissionOption } from './submissionOptions';

interface RegistrySubmissionGuidanceProps {
  option: RegistrySubmissionOption;
  showId: string | null | undefined;
}

export function RegistrySubmissionGuidance({ option, showId }: RegistrySubmissionGuidanceProps) {
  const reportsHref = showId
    ? `/shows/${showId}/reports${option.guidance.reportsQuery ? `?${option.guidance.reportsQuery}` : ''}`
    : null;

  return (
    <section
      aria-labelledby="registry-closeout-guidance-title"
      className="rounded-md border px-4 py-3"
      data-testid="registry-submission-guidance"
    >
      <div className="space-y-3">
        <div>
          <h2 id="registry-closeout-guidance-title" className="text-base font-semibold">
            Closeout guidance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{option.guidance.summary}</p>
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {option.guidance.steps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <p className="text-sm text-muted-foreground">{option.guidance.preservation}</p>

        <div className="flex flex-wrap gap-2 text-sm">
          {reportsHref && (
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to={reportsHref}
            >
              Open Reports
            </Link>
          )}
          {option.guidance.officialLinks.map(link => (
            <a
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              href={link.href}
              key={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
