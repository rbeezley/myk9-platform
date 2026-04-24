import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Dog, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useUpdatePerson } from '@/hooks/useUsers';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { mapDatabaseDogsArray } from '@/services/mappers/dogMappers';
import type { Dog as DogType } from '@/types/dog-types';

export function ProfileSection() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSuccess = useCallback(
    (url: string) => {
      if (form.person) updatePerson.mutate({ ...form.person, profileImage: url });
    },
    [form.person, updatePerson]
  );

  const { upload, uploading } = useAvatarUpload({ userId: form.personId || '', onSuccess });
  const fullName = `${form.person?.firstName || ''} ${form.person?.lastName || ''}`.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
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
              <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG, WebP · max 2 MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-3 gap-2">
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
            <div className="flex gap-2 pt-2">
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
        <CardTitle className="text-base">Linked dogs</CardTitle>
      </CardHeader>
      <CardContent>
        {dogs.length === 0 ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No dogs linked to your account.</p>
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
  const [confirm, setConfirm] = useState(false);

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
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => signOut()}>
                Yes, delete account
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
