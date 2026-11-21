import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { usePremiumFacts } from '@/features/premium/usePremiumFacts';
import { usePremiumDraftCache } from '@/features/premium/premiumDraftCache';
import { applyEditorCopyToPremium } from '@/features/premium/premiumEditorCopy';
import {
  PREMIUM_JUDGE_AFFILIATIONS_KEY,
  type ShowJudgeAffiliation,
} from '@/services/database/judges/judgeAffiliations';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { ShowAscaFactsCard } from './ShowAscaFactsCard';
import { ascaFactsFromForm } from './ShowEditPanel.helpers';

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
  const draftCache = usePremiumDraftCache();
  // The preview lists the same secretary and chair the published premium will (MYK9-2053).
  const { data: officials } = useShowOfficials(showId);
  const queryClient = useQueryClient();
  // MYK9-2244: online, the preview's facts are the server's (the same ones Save & Publish uses),
  // with only the editor's own copy and style laid over them. Offline or on failure the form-built
  // draft stands. The editor takes its first premium once, so nothing is handed over until the
  // facts call settles.
  const hasPublishedContent = publishedContent !== null;
  const { data: serverFacts, isLoading: factsLoading } = usePremiumFacts(
    showId,
    isActive && Boolean(showOrg) && hasPublishedContent
  );
  // MYK9-2216: changing the organization invalidates the stored premium. Until the change is saved
  // and the premium regenerated, no premium text is carried over, so old-organization narratives
  // are never shown or published under the new organization.
  const organizationChanged = Boolean(
    showOrg && savedOrganization && savedOrganization !== showOrg
  );
  const initialPremium = useMemo(() => {
    if (factsLoading || organizationChanged) return undefined;
    if (serverFacts && publishedContent && serverFacts.org === showOrg) {
      // templateId null: a published show's cover edits never write to the club's shared template.
      return {
        ...applyEditorCopyToPremium(serverFacts, {
          style: data.style || 'monogram',
          supplemental: publishedContent.supplemental,
          // The server's narratives already keep a non-blank published edit and fill a blank or
          // legacy-placeholder section, and drop text built for another organization (MYK9-2216);
          // the local snapshot is only the offline fallback below.
          narratives: serverFacts.narratives,
        }),
        templateId: null,
      };
    }
    // MYK9-2292: the device's judge roster carries no affiliation (it lives on the person record,
    // which is not replicated). Use the last checklist read when this device has one; a judge it
    // does not name prints no affiliation rather than a guessed one.
    const cachedAffiliations = showId
      ? queryClient.getQueryData<ShowJudgeAffiliation[]>([PREMIUM_JUDGE_AFFILIATIONS_KEY, showId])
      : undefined;
    const draft = buildLocalPremiumDraft(
      data,
      showOrg,
      publishedContent,
      new Map((cachedAffiliations ?? []).map(judge => [judge.id, judge.affiliation]))
    );
    return draft && officials ? applyOfficialsToPremium(draft, officials) : draft;
  }, [
    data,
    publishedContent,
    showOrg,
    officials,
    serverFacts,
    factsLoading,
    organizationChanged,
    showId,
    queryClient,
  ]);

  // generate-premium reads the SAVED organization, so Regenerate waits for the save.
  const regenerateBlockedReason = organizationChanged
    ? `The organization changed. Save the show, then regenerate the premium for ${showOrg} before publishing.`
    : undefined;

  return (
    <TabsContent
      value="premium"
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

      {showOrg === 'ASCA' && (
        <ShowAscaFactsCard data={data} handleValueChange={handleValueChange} />
      )}

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
              {...(initialPremium ? { initialPremium } : {})}
              deferGeneration={
                factsLoading ||
                (hasShowId && !data.experiencePublishedContent && publishedContentLoading)
              }
              onPremiumChange={handleGeneratedPremiumChange}
              onInkSaverChange={handleInkSaverChange}
              {...(draftCache ? { draftCache } : {})}
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
  publishedContent: ShowExperienceSnapshot | null,
  affiliationByJudgeId: ReadonlyMap<string, string | null>
): GeneratedPremium | undefined {
  // MYK9-2216: a snapshot built for another organization, or published before snapshots recorded
  // it, is not reused offline; the editor generates fresh text instead.
  if (!showOrg || !publishedContent || publishedContent.org !== showOrg) return undefined;

  // MYK9-2044: a cancelled trial is not printed, so the recording fee derived from this schedule
  // does not price it either.
  const liveTrials = (data.trials ?? []).filter(trial =>
    isLivePremiumTrial({ status: trial.status ?? null, deleted_at: trial.deletedAt ?? null })
  );

  const asca = ascaFactsFromForm(data);

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
      // MYK9-2290: the form's unsaved ASCA facts, so the offline draft prints what is typed.
      ascaSanctionStatus: asca.ascaSanctionStatus ?? null,
      scentsByLevel: asca.scentsByLevel ?? null,
      spectatorsPolicy: asca.spectatorsPolicy ?? null,
      photographerContact: asca.photographerContact ?? null,
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
      maxTotalEntries: normalizeEntryLimit(trial.maxTotalEntries),
      judges: (data.assignedJudges ?? []).map(judge => ({
        name: judge.judgeName,
        residence: judge.residence ?? null,
        affiliation: affiliationByJudgeId.get(judge.judgeId) ?? null,
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
