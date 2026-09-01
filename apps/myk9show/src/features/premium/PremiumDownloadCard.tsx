import { useRef, useState } from 'react';
import { FileText, AlertTriangle, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { publishExperience } from '@/features/experience/publishExperience';
import { classifyPremiumPublishState } from '@/features/show-workbench/premiumPublishState';
import { notifications } from '@/lib/notifications';
import { publishInfoQueryKey, usePublishInfo } from './usePublishInfo';
import { useGeneratePremium } from './useGeneratePremium';
import { PREMIUM_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';

// Target ring so a "Finish setup" checklist jump (`#setup-publish-premium`)
// visibly lands here, matching the #setup-publish row's pattern.
const ANCHOR_CLASS =
  'scroll-mt-20 target:ring-2 target:ring-ring target:ring-offset-2 target:ring-offset-background';
const PUBLISH_FAILURE_MESSAGE = "We couldn't publish the premium list. Please try again.";

interface PremiumDownloadCardProps {
  showId: string;
  /**
   * When true, render the "show data has changed since publish" badge to
   * nudge a re-publish. Only shown to people who can manage the show; for
   * exhibitors the staleness signal is internal noise.
   */
  showStaleBadge?: boolean;
}

function PublishFailureNotice({ onRetry, disabled }: { onRetry: () => void; disabled: boolean }) {
  return (
    <Alert variant="destructive" className="w-full flex items-center justify-between gap-3">
      <AlertDescription>{PUBLISH_FAILURE_MESSAGE}</AlertDescription>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-[44px] shrink-0"
        onClick={onRetry}
        disabled={disabled}
      >
        Try again
      </Button>
    </Alert>
  );
}

export function PremiumDownloadCard({ showId, showStaleBadge = false }: PremiumDownloadCardProps) {
  const queryClient = useQueryClient();
  const { generate, isLoading: isGenerating } = useGeneratePremium();
  const [isPublishing, setIsPublishing] = useState(false);
  const { data } = usePublishInfo(showId);
  const [publishFailed, setPublishFailed] = useState(false);
  const publishLatchRef = useRef(false);
  const publishedUrl = data?.publishedUrl;
  const publishedAt = data?.publishedAt;
  const showUpdatedAt = data?.updatedAt;
  const isBusy = isGenerating || isPublishing;

  const handleGenerateAndPublish = async () => {
    if (publishLatchRef.current) return;
    publishLatchRef.current = true;
    setPublishFailed(false);
    setIsPublishing(true);
    try {
      const premium = await generate(showId);
      await publishExperience({ showId, premium, inkSaver: false });
      await Promise.all([
        queryClient.refetchQueries({ queryKey: publishInfoQueryKey(showId), type: 'active' }),
        queryClient.invalidateQueries({
          queryKey: ['shows', showId, 'published-experience-content'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['shows'],
          predicate: query => query.queryKey[2] !== 'publish-info',
        }),
      ]);
      notifications.success('Premium list published');
    } catch {
      setPublishFailed(true);
      notifications.error('Could not publish the premium list');
    } finally {
      setIsPublishing(false);
      publishLatchRef.current = false;
    }
  };

  const hasPublishedPremium = Boolean(publishedUrl && publishedAt);
  const publishedLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const stale =
    showStaleBadge &&
    classifyPremiumPublishState({
      publishedPremiumUrl: publishedUrl,
      publishedPremiumAt: publishedAt,
      updatedAt: showUpdatedAt,
    }) === 'published-stale';

  // Publishing the premium also snapshots the landing-page content
  // (publishExperience), so if that second write failed the PDF can be
  // current while the landing page is still unpublished. Surface the same
  // republish action so the secretary has a way to finish the job — the
  // Setup tab's "Landing page not published" chip lands here.
  const landingUnpublished = showStaleBadge && data?.experienceIsPublished === false;
  const needsRepublish = stale || landingUnpublished;

  return (
    <Card
      id={PREMIUM_CARD_ANCHOR}
      className={cn('p-4 flex flex-wrap items-center gap-4', ANCHOR_CLASS)}
    >
      {publishFailed && (
        <PublishFailureNotice onRetry={handleGenerateAndPublish} disabled={isBusy} />
      )}
      {!hasPublishedPremium ? (
        <>
          <div className="bg-muted text-muted-foreground rounded-md p-3">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Premium List</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Premium PDF is not published yet</p>
          </div>
          {/* size="touch": publishing the premium is a PRIMARY action, which
              docs/INTENT.md § 3 never permits below the 44px floor. */}
          <Button
            size="touch"
            className="shrink-0 whitespace-nowrap"
            onClick={handleGenerateAndPublish}
            disabled={isBusy}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isBusy ? 'Publishing…' : 'Generate & publish premium'}
          </Button>
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
          {needsRepublish && (
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={handleGenerateAndPublish}
              disabled={isBusy}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isBusy ? 'Publishing…' : stale ? 'Republish premium' : 'Publish landing page'}
            </Button>
          )}
          <a
            href={publishedUrl ?? ''}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: 'sm', className: 'shrink-0 whitespace-nowrap' })}
          >
            Download PDF
          </a>
        </>
      )}
    </Card>
  );
}
