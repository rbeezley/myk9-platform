/**
 * Onboarding role step — Judge (MYK9-970).
 *
 * Asks for the judge number for each registry the judge is qualified for.
 * Qualifications are added by show secretaries; this step only fills in the
 * number on rows already on file, through `set_my_judge_numbers`.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchMyJudgeNumbers, saveMyJudgeNumbers, type JudgeRegistryNumber } from '../judgeNumbers';
import { RoleStepFooter } from './RoleStepFooter';

interface StepJudgeProps {
  personId: string;
  onNext: () => void;
  onBack: () => void;
  canGoBack: boolean;
  nextLabel: string;
}

export function StepJudge({ personId, onNext, onBack, canGoBack, nextLabel }: StepJudgeProps) {
  const queryClient = useQueryClient();
  const queryKey = ['onboarding-judge-numbers', personId];
  const {
    data: registries = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => fetchMyJudgeNumbers(personId),
    enabled: Boolean(personId),
  });

  return (
    <div className="space-y-4" data-testid="step-judge">
      <div>
        <h2 className="text-xl font-semibold">Your judge numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your judge number for each registry you judge. Show secretaries use it on the
          paperwork they send in.
        </p>
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
      ) : (
        <JudgeNumberForm
          // Remount when the stored numbers arrive so the inputs start from them.
          key={registries.map(r => `${r.organization}:${r.judge_number}`).join('|')}
          registries={registries}
          loadFailed={isError}
          // The saved numbers become the cached ones, so Back shows them and
          // change detection compares against what is now stored.
          onSaved={saved => queryClient.setQueryData(queryKey, saved)}
          onNext={onNext}
          onBack={onBack}
          canGoBack={canGoBack}
          nextLabel={nextLabel}
        />
      )}
    </div>
  );
}

interface JudgeNumberFormProps extends Omit<StepJudgeProps, 'personId'> {
  registries: JudgeRegistryNumber[];
  loadFailed: boolean;
  onSaved: (saved: JudgeRegistryNumber[]) => void;
}

function JudgeNumberForm({
  registries,
  loadFailed,
  onSaved,
  onNext,
  onBack,
  canGoBack,
  nextLabel,
}: JudgeNumberFormProps) {
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(registries.map(r => [r.organization, r.judge_number]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const changed = registries.filter(r => (numbers[r.organization] ?? '').trim() !== r.judge_number);

  const handleNext = async () => {
    setError('');
    if (changed.length === 0) {
      onNext();
      return;
    }
    setIsSaving(true);
    try {
      await saveMyJudgeNumbers(
        changed.map(r => ({
          organization: r.organization,
          judge_number: numbers[r.organization] ?? '',
        }))
      );
      onSaved(
        registries.map(r => ({ ...r, judge_number: (numbers[r.organization] ?? '').trim() }))
      );
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {loadFailed ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          We couldn&apos;t load your judging registries right now. You can keep going.
        </p>
      ) : registries.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No judging registries are on file for you yet. A show secretary adds them when they assign
          you to a show.
        </p>
      ) : (
        <div className="space-y-3">
          {registries.map(registry => {
            const inputId = `judge-number-${registry.organization}`;
            return (
              <div key={registry.organization} className="space-y-1">
                <Label htmlFor={inputId}>{registry.label}</Label>
                <Input
                  id={inputId}
                  value={numbers[registry.organization] ?? ''}
                  maxLength={50}
                  autoComplete="off"
                  onChange={event =>
                    setNumbers(current => ({
                      ...current,
                      [registry.organization]: event.target.value,
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <RoleStepFooter
        onBack={onBack}
        onNext={handleNext}
        canGoBack={canGoBack}
        nextLabel={nextLabel}
        isSubmitting={isSaving}
        error={error}
      />
    </>
  );
}
