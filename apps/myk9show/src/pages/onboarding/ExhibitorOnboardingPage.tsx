/**
 * Exhibitor Onboarding Wizard — full-page, 5 steps.
 * Route: /onboarding (rendered outside UnifiedAppLayout — no sidebar).
 *
 * Step 1 – Profile        (required, creates exhibitor_profiles row)
 * Step 2 – Add Your Dogs  (skippable)
 * Step 3 – Mailing Address (skippable)
 * Step 4 – Notifications  (skippable)
 * Step 5 – Welcome        (sets onboarding_completed_at, navigates to /shows)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile, CreateExhibitorProfileData } from '@/hooks/useExhibitorProfile';
import { useCreateDogMutation } from '@/hooks/queries/useDogsDatabase';
import { StepProfile, ProfileData } from './steps/StepProfile';
import { StepDogs, DogEntry } from './steps/StepDogs';
import { StepAddress, AddressData } from './steps/StepAddress';
import { StepNotifications, NotificationPrefs } from './steps/StepNotifications';
import { StepWelcome } from './steps/StepWelcome';

const TOTAL_STEPS = 5;

const STEP_LABELS = ['Profile', 'Dogs', 'Address', 'Notifications', 'Welcome'];

function StepIndicator({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100);
  return (
    <div className="space-y-1" aria-label={`Step ${current} of ${total}`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{STEP_LABELS[current - 1]}</span>
        <span>
          {current} of {total}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export default function ExhibitorOnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { createProfileAsync, isCreatingProfile, completeOnboarding, isCompletingOnboarding } =
    useExhibitorProfile();
  const createDogMutation = useCreateDogMutation();

  const userMeta = user?.user_metadata ?? {};

  // Wizard state
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState('');

  // Step data
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: (userMeta.first_name ?? userMeta.firstName ?? '') as string,
    lastName: (userMeta.last_name ?? userMeta.lastName ?? '') as string,
    phone: (userMeta.phone ?? '') as string,
  });
  const [dogs, setDogs] = useState<DogEntry[]>([]);
  const [addressData, setAddressData] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    emailResults: true,
    emailReminders: true,
    pushResults: false,
    pushReminders: false,
  });

  // ── Step 1: create profile ──────────────────────────────────────────────────
  const handleProfileNext = async () => {
    setStepError('');
    if (!profileData.firstName.trim() || !profileData.lastName.trim()) {
      setStepError('First name and last name are required.');
      return;
    }
    try {
      const trimmedPhone = profileData.phone.trim();
      const payload: CreateExhibitorProfileData = {
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        email: user?.email ?? '',
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      };
      await createProfileAsync(payload);
      setStep(2);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Failed to create profile. Please retry.');
    }
  };

  // ── Step 2: create dogs (best-effort, non-blocking) ─────────────────────────
  const handleDogsNext = async () => {
    setStepError('');
    // Fire dog creation in parallel; ignore individual failures — dogs can be added later.
    if (dogs.length > 0) {
      const personId = user?.id; // dogs.owner_id uses person_id, fetched after profile creation.
      // We can only create dogs after the profile (and person) exist.
      // We attempt creation; if the person_id isn't available yet we skip silently.
      if (personId) {
        await Promise.allSettled(
          dogs.map(d =>
            createDogMutation.mutateAsync({
              name: d.callName.trim(),
              call_name: d.callName.trim() || null,
              breed: d.breed.trim(),
              akc_number: d.registrationNumber.trim() || null,
              other_registry_number: null,
              owner_id: personId,
            })
          )
        );
      }
    }
    setStep(3);
  };

  const handleDogsSkip = () => {
    setStepError('');
    setStep(3);
  };

  // ── Step 3: address (stored locally only — no DB column yet) ─────────────────
  const handleAddressNext = () => {
    setStepError('');
    setStep(4);
  };

  const handleAddressSkip = () => {
    setStepError('');
    setStep(4);
  };

  // ── Step 4: notifications (stored locally only) ──────────────────────────────
  const handleNotifNext = () => {
    setStepError('');
    setStep(5);
  };

  const handleNotifSkip = () => {
    setStepError('');
    setStep(5);
  };

  // ── Step 5: complete onboarding ───────────────────────────────────────────────
  const handleFinish = async () => {
    setStepError('');
    try {
      await completeOnboarding();
      navigate('/shows', { replace: true });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const goBack = () => {
    setStepError('');
    setStep(s => Math.max(1, s - 1));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to myK9Show</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let's get you set up in just a few steps.
          </p>
        </div>

        {/* Progress */}
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* Step content */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {step === 1 && (
            <StepProfile
              data={profileData}
              email={user?.email ?? ''}
              onChange={setProfileData}
              onNext={handleProfileNext}
              isSubmitting={isCreatingProfile}
              error={stepError}
            />
          )}
          {step === 2 && (
            <StepDogs
              dogs={dogs}
              onChange={setDogs}
              onNext={handleDogsNext}
              onBack={goBack}
              onSkip={handleDogsSkip}
            />
          )}
          {step === 3 && (
            <StepAddress
              data={addressData}
              onChange={setAddressData}
              onNext={handleAddressNext}
              onBack={goBack}
              onSkip={handleAddressSkip}
            />
          )}
          {step === 4 && (
            <StepNotifications
              data={notifPrefs}
              onChange={setNotifPrefs}
              onNext={handleNotifNext}
              onBack={goBack}
              onSkip={handleNotifSkip}
            />
          )}
          {step === 5 && (
            <StepWelcome
              onFinish={handleFinish}
              onBack={goBack}
              isSubmitting={isCompletingOnboarding}
              error={stepError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
