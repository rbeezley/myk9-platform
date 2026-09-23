import { FileText, AlertTriangle, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { usePremiumPublishControl } from './usePremiumPublishControl';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { PREMIUM_UP_TO_DATE_REASON } from './premiumPublishAction';

// `scroll-mt-20` only. The `target:ring-*` classes that used to live here could
// never fire: the one link that carried `#setup-publish-premium` was a router
// `<Link>`, and a `pushState` is not fragment navigation, so `:target` never
// matched. That link is gone -- the header Actions item runs this card's own
// flow directly now -- so the dead styling goes with it (MYK9-630 round 4).
const ANCHOR_CLASS = 'scroll-mt-20';

interface PremiumDownloadCardProps {
  showId: string;
  /** True only after the show-management scope resolves for this show. */
  canManageShow: boolean;
  /**
   * When true, render the "show data has changed since publish" badge to
   * nudge a re-publish. Only shown to people who can manage the show; for
   * exhibitors the staleness signal is internal noise.
   */
  showStaleBadge?: boolean;
}

function PublishFailureNotice({
  message,
  onRetry,
  disabled,
}: {
  message: string;
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <Alert variant="destructive" className="w-full flex items-center justify-between gap-3">
      <AlertDescription>{message}</AlertDescription>
      {/* `touch` rather than sm plus a min-h-[44px] override: same floor, but it
          also grows to 48px on tablet as docs/INTENT.md 3 prefers, and the size
          lives in the variant where the rule can see it. */}
      <Button
        type="button"
        size="touch"
        variant="outline"
        className="shrink-0"
        onClick={onRetry}
        disabled={disabled}
      >
        Try again
      </Button>
    </Alert>
  );
}

export function PremiumDownloadCard({
  showId,
  canManageShow,
  showStaleBadge = false,
}: PremiumDownloadCardProps) {
  // Read, derivation and flow all come from one hook, because the header
  // Actions menu offers the SAME publish from every section and the two must
  // never disagree about whether it is on offer or what it is called.
  const {
    run: handleGenerateAndPublish,
    isBusy,
    publishFailed,
    failureMessage,
    info,
    hasPublishedPremium,
    stale,
    landingUnpublished,
    needsRepublish,
    action,
    infoState,
  } = usePremiumPublishControl(showId, showStaleBadge, canManageShow);
  const publishedUrl = info?.publishedUrl;
  const publishedAt = info?.publishedAt;

  const publishedLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <Card
      id={PREMIUM_CARD_ANCHOR}
      className={cn('p-4 flex flex-wrap items-center gap-4', ANCHOR_CLASS)}
    >
      {publishFailed && (
        <PublishFailureNotice
          message={failureMessage}
          onRetry={handleGenerateAndPublish}
          disabled={isBusy || action.disabledReason !== undefined}
        />
      )}
      {!hasPublishedPremium ? (
        <>
          <div className="bg-muted text-muted-foreground rounded-md p-3">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Premium List</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {infoState === 'ready' ? 'Premium PDF is not published yet' : action.disabledReason}
            </p>
          </div>
          {/* size="touch": publishing the premium is a PRIMARY action, which
              docs/INTENT.md § 3 never permits below the 44px floor. */}
          <div className="flex shrink-0 flex-col items-start gap-1">
            <Button
              size="touch"
              className="whitespace-nowrap"
              onClick={handleGenerateAndPublish}
              disabled={action.disabledReason !== undefined}
              {...(action.disabledReason ? { title: action.disabledReason } : {})}
            >
              <Upload className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
            {action.disabledReason && (
              <span className="text-sm text-muted-foreground">{action.disabledReason}</span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="bg-primary/10 text-primary rounded-md p-3">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Premium List</h3>
              {stale ? (
                <span className="inline-flex items-center gap-1 text-xs text-warning ">
                  <AlertTriangle className="h-3 w-3" />
                  Show data has changed since publish
                </span>
              ) : landingUnpublished ? (
                <span className="inline-flex items-center gap-1 text-xs text-warning ">
                  <AlertTriangle className="h-3 w-3" />
                  Landing page not published
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Premium PDF published {publishedLabel}
            </p>
          </div>
          {(needsRepublish ||
            (action.disabledReason !== undefined &&
              action.disabledReason !== PREMIUM_UP_TO_DATE_REASON)) && (
            <div className="flex shrink-0 flex-col items-start gap-1">
              <Button
                size="touch"
                className="whitespace-nowrap"
                onClick={handleGenerateAndPublish}
                disabled={action.disabledReason !== undefined}
                {...(action.disabledReason ? { title: action.disabledReason } : {})}
              >
                <Upload className="h-4 w-4 mr-2" />
                {action.label}
              </Button>
              {action.disabledReason && (
                <span className="text-sm text-muted-foreground">{action.disabledReason}</span>
              )}
            </div>
          )}
          <a
            href={publishedUrl ?? ''}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: 'touch', className: 'shrink-0 whitespace-nowrap' })}
          >
            Download PDF
          </a>
        </>
      )}
    </Card>
  );
}
