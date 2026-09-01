import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getInitials } from '@/lib/utils';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useUpdatePerson } from '@/hooks/useUsers';
import { useAuthContext } from '@/hooks/useAuthContext';
import { USER_ROLE_HIERARCHY } from '@/types/auth-types';
import { ROLE_LABELS } from '@/services/rbac/roleUiConstants';
import { deleteUser } from '@/services/database/users/reads';
import { revokeSelfAuthIdentity } from '@/services/auth/revokeSelfAuthIdentity';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { Award } from 'lucide-react';
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';

const DELETE_CONFIRMATION_TEXT = 'DELETE';
const PENDING_SELF_DELETE_REVOCATION_KEY_PREFIX = 'myk9:pending-self-delete-auth-revocation';

function getPendingSelfDeleteRevocationKey(authUserId: string) {
  return `${PENDING_SELF_DELETE_REVOCATION_KEY_PREFIX}:${authUserId}`;
}

export function ProfileSection() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const { getUserRoles } = useAuthContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSuccess = useCallback(
    async (url: string) => {
      if (form.person) await updatePerson.mutateAsync({ ...form.person, profileImage: url });
    },
    [form.person, updatePerson]
  );

  const { upload, uploading, error: avatarError } = useAvatarUpload({ onSuccess });
  const fullName = `${form.person?.firstName || ''} ${form.person?.lastName || ''}`.trim();
  const userRoles = new Set(getUserRoles());
  const roles = USER_ROLE_HIERARCHY.filter(role => userRoles.has(role));

  // Auto-clear the inline success indicator after a few seconds, matching
  // SecuritySettings' password-update feedback pattern.
  useEffect(() => {
    if (!form.saveSuccess) return;
    const timer = setTimeout(() => form.clearSaveStatus(), 4000);
    return () => clearTimeout(timer);
  }, [form.saveSuccess, form]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              {form.person?.profileImage && (
                <AvatarImage src={form.person.profileImage} alt={fullName} />
              )}
              <AvatarFallback className="text-lg">{getInitials(fullName)}</AvatarFallback>
            </Avatar>
            <div>
              {/* size="touch": an action on a settings page is not a dense
                  data grid, so it takes the 44px floor (docs/INTENT.md § 3). */}
              <Button
                variant="outline"
                size="touch"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-4 w-4" />
                    Change photo
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG, WebP · max 5MB</p>
              {avatarError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{avatarError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.saveSuccess && (
            <Alert className="border-success/30 bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertDescription>Profile updated successfully.</AlertDescription>
            </Alert>
          )}
          {form.saveError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{form.saveError}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={form.values.firstName}
                onChange={e => form.setValue('firstName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={form.values.lastName}
                onChange={e => form.setValue('lastName', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">
              <Mail className="inline h-3.5 w-3.5 mr-1 opacity-60" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              readOnly
              aria-readonly="true"
              className="cursor-default bg-muted text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <p className="text-xs text-muted-foreground">Email can&apos;t be changed here.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">
              <Phone className="inline h-3.5 w-3.5 mr-1 opacity-60" />
              Phone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={form.values.phone}
              onChange={e => form.setValue('phone', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              <MapPin className="inline h-3.5 w-3.5 mr-1 opacity-60" />
              Location
            </Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="City"
                placeholder="City"
                value={form.values.city}
                onChange={e => form.setValue('city', e.target.value)}
              />
              <Input
                aria-label="State"
                placeholder="State"
                value={form.values.state}
                onChange={e => form.setValue('state', e.target.value)}
              />
              <Input
                aria-label="ZIP or postal code"
                placeholder="ZIP"
                value={form.values.zipCode}
                onChange={e => form.setValue('zipCode', e.target.value)}
              />
            </div>
          </div>
          {form.isDirty && (
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button onClick={form.save} disabled={form.saving} size="sm">
                {form.saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={form.reset}>
                Discard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your roles</CardTitle>
          <p className="text-sm text-muted-foreground">
            These roles determine which parts of myK9Show are available to you.
          </p>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Assigned roles">
              {roles.map(role => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Roles are managed by your organization administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function BillingSection() {
  // Both values come from the entitlement resolver via the gate — the founding
  // end date used to be read straight off `people.early_adopter_until`, which
  // no longer exists (task 8.2).
  const { isEarlyAdopter, foundingUntil } = useSubscriptionGate();

  return (
    <div className="space-y-6">
      {/* Founding-member context — real, per-user, and reassuring. Mirrors the
          banner on the standalone /subscription page. */}
      {isEarlyAdopter && foundingUntil && (
        <Alert className="border-amber-400/60">
          <Award className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            <span className="font-semibold">Founding member</span> — premium is on us until{' '}
            {new Date(foundingUntil).toLocaleDateString()}. Thank you for being here early.
          </AlertDescription>
        </Alert>
      )}

      {/* Reuse the standalone subscription manager (billing + history only). */}
      <SubscriptionManager portalReturnPath="/account?section=billing" />
    </div>
  );
}

export function DeleteSection() {
  const { signOut, user } = useAuthContext();
  const form = useProfileForm();
  const [confirm, setConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [personDeleted, setPersonDeleted] = useState(() => {
    const authUserId = user?.id;
    return (
      !!authUserId && localStorage.getItem(getPendingSelfDeleteRevocationKey(authUserId)) === 'true'
    );
  });
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === DELETE_CONFIRMATION_TEXT;

  const handleCancel = () => {
    setConfirm(false);
    setConfirmText('');
    setError(null);
  };

  // Guard double-submits via ref — state updates lag a second synchronous click.
  const inFlight = useRef(false);

  const handleDelete = async () => {
    if (inFlight.current || !canDelete) return;
    inFlight.current = true;
    setIsDeleting(true);
    setError(null);

    if (!personDeleted) {
      const personId = form.person?.id;
      if (!personId) {
        setError('No profile found for this account.');
        inFlight.current = false;
        setIsDeleting(false);
        return;
      }

      // Pass the DatabaseError object itself to getUserFriendlyError so its
      // `code` survives — MK001 (owns live dogs) must map to the "delete your
      // dogs first" message.
      const { error: deleteError } = await deleteUser(personId);

      if (deleteError) {
        setError(getUserFriendlyError(deleteError));
        inFlight.current = false;
        setIsDeleting(false);
        return;
      }

      if (user?.id) {
        localStorage.setItem(getPendingSelfDeleteRevocationKey(user.id), 'true');
      }
      setPersonDeleted(true);
    }

    const { error: revokeError } = await revokeSelfAuthIdentity();
    if (revokeError) {
      setError(
        "Your profile was deleted, but we couldn't disable sign-in. Please try again or contact support."
      );
      inFlight.current = false;
      setIsDeleting(false);
      return;
    }

    if (user?.id) {
      localStorage.removeItem(getPendingSelfDeleteRevocationKey(user.id));
    }
    toast.success('Your account has been deleted.');
    try {
      // Await so a sign-out failure (network/auth outage) surfaces here
      // instead of vanishing as a detached rejection. The account row is
      // already tombstoned, so the message must not claim the delete failed.
      await signOut();
    } catch {
      setError(
        'Your account was deleted, but signing out failed. Please close this tab or refresh.'
      );
      inFlight.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Delete account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        {/* size="touch" below. A DESTRUCTIVE action is never permitted under
            the floor, whatever the surface — docs/INTENT.md § 3 names this case
            explicitly. Deleting an account at 32px was the clearest breach of
            the rule in the codebase. */}
        {!confirm ? (
          <Button variant="destructive" size="touch" onClick={() => setConfirm(true)}>
            Delete my account
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              Are you sure? This cannot be undone.
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm-text">
                Type <span className="font-semibold">{DELETE_CONFIRMATION_TEXT}</span> to confirm
              </Label>
              <Input
                id="delete-confirm-text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder={DELETE_CONFIRMATION_TEXT}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={!canDelete || isDeleting}
              >
                {isDeleting
                  ? personDeleted
                    ? 'Disabling sign-in…'
                    : 'Deleting…'
                  : personDeleted
                    ? 'Retry disabling sign-in'
                    : 'Yes, delete account'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isDeleting}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
