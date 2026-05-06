import { FileText, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/services/database/supabaseClient';

interface PremiumDownloadCardProps {
  showId: string;
  /**
   * When true, render the "show data has changed since publish" badge to
   * nudge a re-publish. Only shown to people who can manage the show; for
   * exhibitors the staleness signal is internal noise.
   */
  showStaleBadge?: boolean;
}

interface PublishInfo {
  publishedUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

async function fetchPublishInfo(showId: string): Promise<PublishInfo> {
  // Direct query bypasses the IndexedDB-replicated show row, which doesn't
  // include the post-189 columns. Read-only and cheap.
  const { data, error } = await supabase
    .from('shows')
    .select('published_premium_url, published_premium_at, updated_at')
    .eq('id', showId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  return {
    publishedUrl: (row?.published_premium_url as string | null) ?? null,
    publishedAt: (row?.published_premium_at as string | null) ?? null,
    updatedAt: (row?.updated_at as string | null) ?? null,
  };
}

export function PremiumDownloadCard({ showId, showStaleBadge = false }: PremiumDownloadCardProps) {
  const { data } = useQuery({
    queryKey: ['shows', showId, 'publish-info'],
    queryFn: () => fetchPublishInfo(showId),
    staleTime: 30_000,
  });
  const publishedUrl = data?.publishedUrl;
  const publishedAt = data?.publishedAt;
  const showUpdatedAt = data?.updatedAt;
  if (!publishedUrl || !publishedAt) return null;

  const publishedLabel = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // `published_premium_at` is written from the JS client clock; `updated_at`
  // is set by a Postgres trigger using NOW(). Those two clocks can disagree
  // by hundreds of ms on the same UPDATE. Use a tolerance window so the badge
  // only appears for genuine post-publish edits, not clock skew at publish.
  const STALE_TOLERANCE_MS = 5_000;
  const stale =
    showStaleBadge &&
    showUpdatedAt &&
    new Date(showUpdatedAt).getTime() - new Date(publishedAt).getTime() > STALE_TOLERANCE_MS;

  return (
    <Card className="p-4 flex items-center gap-4">
      <div className="bg-primary/10 text-primary rounded-md p-3">
        <FileText className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Premium List</h3>
          {stale && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Show data has changed since publish
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Published {publishedLabel}</p>
      </div>
      <Button asChild size="sm">
        <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
          Download PDF
        </a>
      </Button>
    </Card>
  );
}
