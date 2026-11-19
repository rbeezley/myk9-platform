import { useCallback, useMemo } from 'react';
import { isLivePremiumTrial } from '@myk9/core';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { applyOfficialsToPremium } from '@/features/premium/premiumOfficials';
import { Link } from 'react-router-dom';
import { FileText, Palette } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TabsContent } from '@/components/ui/tabs';
import { usePublishedExperienceContent } from '@/features/experience/usePublishedExperienceContent';
import { PremiumContentEditor } from '@/features/premium/PremiumContentEditor';
import { getShowPreviewHref } from '@/components/shows/showPreviewRoutes';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import { normalizeEntryLimit } from '@/features/premium/premiumEntryLimit';
import type { ShowEditFormData } from './ShowEditPanel.types';

interface ShowEditPremiumTabProps {
  data: ShowEditFormData;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | 'ASCA' | null;
  /** The organization saved on the show; the generator reads it, not the unsaved form value. */
  savedOrganization?: string | undefined;
  isActive: boolean;
  handleCheckboxChange: (field: keyof ShowEditFormData) => (checked: boolean) => void;
  handleValueChange: <K extends keyof ShowEditFormData>(
    field: K
  ) => (value: ShowEditFormData[K]) => void;
  /** Told when a Regenerate starts and settles, so the panel can hold Save (MYK9-2144). */
  onPremiumPendingChange?: (pending: boolean) => void;
  /** Told whether the premium narratives or details were edited since they loaded (MYK9-2201). */
  onPremiumEditedChange?: (edited: boolean) => void;
}

export function ShowEditPremiumTab({
  data,
  clubId,
  showOrg,
  savedOrganization,
  isActive,
  handleCheckboxChange,
  handleValueChange,
  onPremiumPendingChange,
  onPremiumEditedChange,
}: ShowEditPremiumTabProps) {
  const hasShowId = typeof data.id === 'string' && data.id.length > 0;
  const showId = hasShowId ? (data.id as string) : undefined;
  const { data: fetchedPublishedContent, isLoading: publishedContentLoading } =
    usePublishedExperienceContent(hasShowId ? (data.id as string) : undefined);
  const publishedContent = data.experiencePublishedContent ?? fetchedPublishedContent ?? null;
  const handleGeneratedPremiumChange = useCallback(
    (premium: ShowEditFormData['generatedPremium']) => {
      handleValueChange('generatedPremium')(premium);
    },
    [handleValueChange]
  );
  const handleInkSaverChange = useCallback(
    (inkSaver: boolean) => {
      handleValueChange('inkSaver')(inkSaver);
    },
    [handleValueChange]
  );
  // The preview lists the same secretary and chair the published premium will (MYK9-2053).
  const { data: officials } = useShowOfficials(showId);
  const initialPremium = useMemo(() => {
    const draft = buildLocalPremiumDraft(data, showOrg, publishedContent);
    return draft && officials ? applyOfficialsToPremium(draft, officials) : draft;
  }, [data, publishedContent, showOrg, officials]);

  // MYK9-2213: generate-premium reads the SAVED organization, so while the form's differs a
  // Regenerate would build the premium for the wrong one.
  const regenerateBlockedReason =
    showOrg && savedOrganization && savedOrganization !== showOrg
      ? `Save the show first. Regenerate builds from the saved organization (${savedOrganization}).`
      : undefined;

  return (
    // MYK9-2201: keepMounted, so the premium editor's own state (its edits, the generation it
    // compares them with, a narrative-generation warning) survives a visit to another tab, and
    // Save still asks about edits made before it. Nothing is restored from a copy.
    <TabsContent
      value="premium"
      keepMounted
      className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
    >
      <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Show Experience Style
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sets the look and feel for the premium list, landing page, entry form, and confirmation
            email.
          </p>
        </CardHeader>
        <CardContent>
          {showId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The current draft style is{' '}
                <span className="font-medium text-foreground">{data.style || 'monogram'}</span>.
                Choose and save presentation styles in the show Preview so the live rendering and
                draft stay together.
              </p>
              <Link
                to={getShowPreviewHref(showId, getShowEditHref(showId, 'premium'))}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Open show Preview
              </Link>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Save the show first to choose a presentation style.
              </AlertDescription>
            </Alert>
          )}
          <label className="mt-4 flex items-start gap-3 rounded-md border p-3 cursor-pointer">
            <Checkbox
              aria-label="Generate exhibitor documents on save"
              checked={Boolean(data.publishExperience)}
              onCheckedChange={checked =>
                handleCheckboxChange('publishExperience')(Boolean(checked))
              }
            />
            <span>
              <span className="block text-sm font-medium">
                Generate exhibitor documents on save
              </span>
              <span className="block text-xs text-muted-foreground">
                When you save, publish the premium list, landing page, entry form, and confirmation
                email from this Experience configuration.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Shared Show Content
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Review generated narratives and supplemental details used across the premium list,
            landing page, entry form, and confirmation email.
          </p>
        </CardHeader>
        <CardContent>
          {hasShowId ? (
            <PremiumContentEditor
              showId={data.id as string}
              clubId={clubId}
              showOrg={showOrg}
              {...(regenerateBlockedReason ? { regenerateBlockedReason } : {})}
              style={(data.style || 'monogram') as PremiumStyle}
              active={isActive}
              resetWhenInactive={false}
              {...(initialPremium ? { initialPremium } : {})}
              deferGeneration={
                hasShowId && !data.experiencePublishedContent && publishedContentLoading
              }
              onPremiumChange={handleGeneratedPremiumChange}
              onInkSaverChange={handleInkSaverChange}
              {...(onPremiumEditedChange ? { onEditedChange: onPremiumEditedChange } : {})}
              {...(onPremiumPendingChange ? { onPendingChange: onPremiumPendingChange } : {})}
            />
          ) : (
            <Alert>
              <AlertDescription>
                Save the show first to generate experience content.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function currencyToNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLocalPremiumDraft(
  data: ShowEditFormData,
  showOrg: 'AKC' | 'UKC' | 'ASCA' | null,
  publishedContent: ShowExperienceSnapshot | null
): GeneratedPremium | undefined {
  if (!showOrg || !publishedContent) return undefined;

  // MYK9-2044: a cancelled trial is not printed, so the recording fee derived from this schedule
  // does not price it either.
  const liveTrials = (data.trials ?? []).filter(trial =>
    isLivePremiumTrial({ status: trial.status ?? null, deleted_at: trial.deletedAt ?? null })
  );

  return {
    org: showOrg,
    style: (data.style || 'monogram') as PremiumStyle,
    templateId: null,
    show: {
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      venue: data.location,
      entryOpenDate: data.entryOpenDate || null,
      entryCloseDate: data.entryCloseDate || null,
      preEntryFee: currencyToNumber(data.preEntryFee),
      dayOfFee: currencyToNumber(data.dayOfShowFee),
      acceptChecks: Boolean(data.acceptCheckPayments),
      acceptCash: Boolean(data.acceptCashPayments),
      maxTotalEntries: normalizeEntryLimit(data.maxTotalEntries),
    },
    club: {
      name: data.clubName ?? '',
      logoUrl: data.logoUrl || null,
    },
    secretary: {
      name: null,
      email: null,
      phone: null,
      mailingAddress: null,
    },
    officials: {
      chairman: null,
    },
    trials: liveTrials.map(trial => ({
      name: trial.name,
      date: trial.date,
      startTime: null,
      eventNumber: trial.trialNumber,
      type: trial.trialType ?? '',
      judges: (data.assignedJudges ?? []).map(judge => ({
        name: judge.judgeName,
        residence: judge.residence ?? null,
        classes: judge.classLabels ?? [],
      })),
      classes: (trial.classes ?? []).map(cls => ({
        element: cls.element ?? '',
        level: cls.level ?? '',
        section: null,
      })),
    })),
    supplemental: publishedContent.supplemental,
    narratives: publishedContent.narratives,
  };
}
