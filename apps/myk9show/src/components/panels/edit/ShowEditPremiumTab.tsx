import { useCallback, useMemo } from 'react';
import { FileText, Palette } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TabsContent } from '@/components/ui/tabs';
import { usePublishedExperienceContent } from '@/features/experience/usePublishedExperienceContent';
import { PremiumContentEditor } from '@/features/premium/PremiumContentEditor';
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import type { ShowEditFormData } from './ShowEditPanel.types';
import { PremiumStyleSelector } from './PremiumStyleSelector';

interface ShowEditPremiumTabProps {
  data: ShowEditFormData;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | null;
  isActive: boolean;
  handleSelectChange: (field: keyof ShowEditFormData) => (value: string) => void;
  handleCheckboxChange: (field: keyof ShowEditFormData) => (checked: boolean) => void;
  handleValueChange: <K extends keyof ShowEditFormData>(
    field: K
  ) => (value: ShowEditFormData[K]) => void;
}

export function ShowEditPremiumTab({
  data,
  clubId,
  showOrg,
  isActive,
  handleSelectChange,
  handleCheckboxChange,
  handleValueChange,
}: ShowEditPremiumTabProps) {
  const hasShowId = typeof data.id === 'string' && data.id.length > 0;
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
  const initialPremium = useMemo(
    () => buildLocalPremiumDraft(data, showOrg, publishedContent),
    [data, publishedContent, showOrg]
  );

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
          <PremiumStyleSelector
            selectedStyle={(data.style || 'monogram') as PremiumStyle}
            onSelect={style => handleSelectChange('style')(style)}
          />
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
              style={(data.style || 'monogram') as PremiumStyle}
              active={isActive}
              {...(initialPremium ? { initialPremium } : {})}
              deferGeneration={
                hasShowId && !data.experiencePublishedContent && publishedContentLoading
              }
              onPremiumChange={handleGeneratedPremiumChange}
              onInkSaverChange={handleInkSaverChange}
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
  showOrg: 'AKC' | 'UKC' | null,
  publishedContent: ShowExperienceSnapshot | null
): GeneratedPremium | undefined {
  if (!showOrg || !publishedContent) return undefined;

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
    trials: (data.trials ?? []).map(trial => ({
      name: trial.name,
      date: trial.date,
      startTime: null,
      eventNumber: trial.trialNumber,
      type: trial.trialType ?? '',
      judges: (data.assignedJudges ?? []).map(judge => ({
        name: judge.judgeName,
        elements: judge.assignedClasses ?? [],
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
