/**
 * Onboarding Step 4 - Notifications
 * Push/email opt-in checkboxes. Skippable.
 * Stored in component state only — preferences are saved via the
 * existing /preferences page after onboarding. We capture intent here
 * and pass it up to the wizard for optional later processing.
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export interface NotificationPrefs {
  emailResults: boolean;
  emailReminders: boolean;
  pushResults: boolean;
  pushReminders: boolean;
}

interface StepNotificationsProps {
  data: NotificationPrefs;
  onChange: (data: NotificationPrefs) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface NotifRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}

function NotifRow({ id, label, description, checked, onToggle }: NotifRowProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-primary cursor-pointer"
        checked={checked}
        onChange={e => onToggle(e.target.checked)}
      />
      <div>
        <Label htmlFor={id} className="font-normal cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function StepNotifications({
  data,
  onChange,
  onNext,
  onBack,
  onSkip,
}: StepNotificationsProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="step-notifications">
      <div>
        <h2 className="text-xl font-semibold">Notification preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you want to hear about results and upcoming events. You can change these
          anytime from Preferences.
        </p>
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
        <NotifRow
          id="pref-email-results"
          label="Results published"
          description="Get an email when your class results are released."
          checked={data.emailResults}
          onToggle={v => onChange({ ...data, emailResults: v })}
        />
        <NotifRow
          id="pref-email-reminders"
          label="Show reminders"
          description="Reminders before shows you are entered in."
          checked={data.emailReminders}
          onToggle={v => onChange({ ...data, emailReminders: v })}
        />
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Push (mobile)
        </p>
        <NotifRow
          id="pref-push-results"
          label="Results published"
          description="Instant notification when results drop."
          checked={data.pushResults}
          onToggle={v => onChange({ ...data, pushResults: v })}
        />
        <NotifRow
          id="pref-push-reminders"
          label="Show reminders"
          description="Push reminders before your classes."
          checked={data.pushReminders}
          onToggle={v => onChange({ ...data, pushReminders: v })}
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit">Next</Button>
        </div>
      </div>
    </form>
  );
}
