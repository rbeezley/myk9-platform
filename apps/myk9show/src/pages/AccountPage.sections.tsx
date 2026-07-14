import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Camera, Dog, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useUpdatePerson } from '@/hooks/useUsers';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { mapDatabaseDogsArray } from '@/services/mappers/dogMappers';
import { deleteUser } from '@/services/database/users/reads';
import { revokeSelfAuthIdentity } from '@/services/auth/revokeSelfAuthIdentity';
import { getUserFriendlyError } from '@/utils/errorMessages';
import type { Dog as DogType } from '@/types/dog-types';

const DELETE_CONFIRMATION_TEXT = 'DELETE';

export function ProfileSection() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSuccess = useCallback(
    async (url: string) => {
      if (form.person) await updatePerson.mutateAsync({ ...form.person, profileImage: url });
    },
    [form.person, updatePerson]
  );

  const { upload, uploading } = useAvatarUpload({ onSuccess });
  const fullName = `${form.person?.firstName || ''} ${form.person?.lastName || ''}`.trim();

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
              <Button
                variant="outline"
                size="sm"
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
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Input id="email" type="email" value={form.email} readOnly className="opacity-70" />
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
                placeholder="City"
                value={form.values.city}
                onChange={e => form.setValue('city', e.target.value)}
              />
              <Input
                placeholder="State"
                value={form.values.state}
                onChange={e => form.setValue('state', e.target.value)}
              />
              <Input
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
    </div>
  );
}

export function DogsSection() {
  const { data: rawDogs, isLoading } = useDogsQuery();
  const dogs: DogType[] = mapDatabaseDogsArray((rawDogs ?? []) as Record<string, unknown>[]);

  if (isLoading)
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My dogs</CardTitle>
      </CardHeader>
      <CardContent>
        {dogs.length === 0 ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">You don't have any dogs yet.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dogs">Browse or add dogs</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {dogs.map(dog => (
              <li key={dog.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  {dog.imageUrl ? (
                    <img
                      src={dog.imageUrl}
                      alt={dog.callName || dog.name}
                      className="h-9 w-9 rounded-full object-cover border border-border/50"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <Dog className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{dog.callName || dog.name}</p>
                    {dog.breed && <p className="text-xs text-muted-foreground">{dog.breed}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/dogs/${dog.id}`}>View</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DeleteSection() {
  const { signOut } = useAuthContext();
  const form = useProfileForm();
  const [confirm, setConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [personDeleted, setPersonDeleted] = useState(false);
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
    if (!form.person?.id) {
      setError('No profile found for this account.');
      return;
    }
    inFlight.current = true;
    setIsDeleting(true);
    setError(null);

    if (!personDeleted) {
      // Pass the DatabaseError object itself to getUserFriendlyError so its
      // `code` survives — MK001 (owns live dogs) must map to the "delete your
      // dogs first" message.
      const { error: deleteError } = await deleteUser(form.person.id);

      if (deleteError) {
        setError(getUserFriendlyError(deleteError));
        inFlight.current = false;
        setIsDeleting(false);
        return;
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
        {!confirm ? (
          <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
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
