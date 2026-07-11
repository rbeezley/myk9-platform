import { useState } from 'react';
import { FileText, AlertTriangle, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { publishExperience } from '@/features/experience/publishExperience';
import { classifyPremiumPublishState } from '@/features/show-workbench/premiumPublishState';
import { notifications } from '@/lib/notifications';
import { publishInfoQueryKey, usePublishInfo } from './usePublishInfo';
import { useGeneratePremium } from './useGeneratePremium';

interface PremiumDownloadCardProps {
  showId: string;
  /**
   * When true, render the "show data has changed since publish" badge to
   * nudge a re-publish. Only shown to people who can manage the show; for
   * exhibitors the staleness signal is internal noise.
   */
  showStaleBadge?: boolean;
}

export function PremiumDownloadCard({ showId, showStaleBadge = false }: PremiumDownloadCardProps) {
  const queryClient = useQueryClient();
  const { generate, isLoading: isGenerating } = useGeneratePremium();
  const [isPublishing, setIsPublishing] = useState(false);
  const { data } = usePublishInfo(showId);
  const publishedUrl = data?.publishedUrl;
  const publishedAt = data?.publishedAt;
  const showUpdatedAt = data?.updatedAt;
  const isBusy = isGenerating || isPublishing;

  const handleGenerateAndPublish = async () => {
    setIsPublishing(true);
    try {
      const premium = await generate(showId);
      await publishExperience({ showId, premium, inkSaver: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: publishInfoQueryKey(showId) }),
        queryClient.invalidateQueries({
          queryKey: ['shows', showId, 'published-experience-content'],
        }),
        queryClient.invalidateQueries({ queryKey: ['shows'] }),
      ]);
      notifications.success('Premium list published');
    } catch (error) {
      notifications.error('Could not publish the premium list', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  if (!publishedUrl || !publishedAt) {
    return (
      <Card className="p-4 flex flex-wrap items-center gap-4">
        <div className="bg-muted text-muted-foreground rounded-md p-3">
          <FileText className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Premium List</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Premium PDF is not published yet</p>
        </div>
        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap"
          onClick={handleGenerateAndPublish}
          disabled={isBusy}
        >
          <Upload className="h-4 w-4 mr-2" />
          {isBusy ? 'Publishing…' : 'Generate & publish premium'}
        </Button>
      </Card>
    );
  }

  const publishedLabel = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const stale =
    showStaleBadge &&
    classifyPremiumPublishState({
      publishedPremiumUrl: publishedUrl,
      publishedPremiumAt: publishedAt,
      updatedAt: showUpdatedAt,
    }) === 'published-stale';

  return (
    <Card className="p-4 flex flex-wrap items-center gap-4">
      <div className="bg-primary/10 text-primary rounded-md p-3">
        <FileText className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Premium List</h3>
          {stale && (
            <span className="inline-flex items-center gap-1 text-xs text-warning ">
              <AlertTriangle className="h-3 w-3" />
              Show data has changed since publish
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Premium PDF published {publishedLabel}
        </p>
      </div>
      {stale && (
        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap"
          onClick={handleGenerateAndPublish}
          disabled={isBusy}
        >
          <Upload className="h-4 w-4 mr-2" />
          {isBusy ? 'Publishing…' : 'Republish premium'}
        </Button>
      )}
      <a
        href={publishedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ size: 'sm', className: 'shrink-0 whitespace-nowrap' })}
      >
        Download PDF
      </a>
    </Card>
  );
}
