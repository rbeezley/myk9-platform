import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, Phone, MapPin, Camera, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { useUpdatePerson } from '@/hooks/useUsers';

export default function ProfilePage() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { upload, uploading } = useAvatarUpload({
    onSuccess: async publicUrl => {
      if (form.person) {
        await updatePerson.mutateAsync({ ...form.person, profileImage: publicUrl });
      }
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    form.save();
  };

  if (form.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Handle no-person-record edge case — new users who skipped onboarding
  if (!form.person) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Unable to load your profile.</p>
          <p className="text-sm text-muted-foreground">
            Your account may not have a linked profile yet. Please complete onboarding to set up
            your profile.
          </p>
          <Button variant="outline" asChild>
            <Link to="/exhibitor/dashboard">Go to My Shows</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>

      {/* Profile Photo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative rounded-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Change profile photo"
          >
            <Avatar className="w-32 h-32 border-2 border-muted group-hover:opacity-75 transition-opacity">
              {form.person.profileImage ? (
                <AvatarImage src={form.person.profileImage} alt="Profile photo" />
              ) : (
                <AvatarFallback className="text-4xl font-semibold bg-muted text-muted-foreground">
                  {getInitials(form.values.firstName, form.values.lastName)}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all rounded-full">
              {uploading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <Camera className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
          <p className="text-xs text-muted-foreground">
            Click to upload. JPG, PNG, or WebP, max 5MB.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    value={form.values.firstName}
                    onChange={e => form.setValue('firstName', e.target.value)}
                    className="pl-9"
                    required
                    autoComplete="given-name"
                  />
                </div>
                {form.errors.firstName && (
                  <p className="text-sm text-destructive">{form.errors.firstName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name *</Label>
                <Input
                  id="lastName"
                  value={form.values.lastName}
                  onChange={e => form.setValue('lastName', e.target.value)}
                  required
                  autoComplete="family-name"
                />
                {form.errors.lastName && (
                  <p className="text-sm text-destructive">{form.errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  disabled
                  className="pl-9 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email is managed by your authentication account.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={form.values.phone}
                  onChange={e => form.setValue('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="pl-9"
                  autoComplete="tel"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Address</CardTitle>
            <p className="text-sm text-muted-foreground">
              Required for AKC and UKC event reporting.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="streetAddress">Street address *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="streetAddress"
                  value={form.values.streetAddress}
                  onChange={e => form.setValue('streetAddress', e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="street-address"
                />
              </div>
              {form.errors.streetAddress && (
                <p className="text-sm text-destructive">{form.errors.streetAddress}</p>
              )}
            </div>

            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={form.values.city}
                  onChange={e => form.setValue('city', e.target.value)}
                  required
                  autoComplete="address-level2"
                />
                {form.errors.city && <p className="text-sm text-destructive">{form.errors.city}</p>}
              </div>
              <div className="col-span-1 space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={form.values.state}
                  onChange={e => form.setValue('state', e.target.value)}
                  required
                  autoComplete="address-level1"
                />
                {form.errors.state && (
                  <p className="text-sm text-destructive">{form.errors.state}</p>
                )}
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="zipCode">Zip code *</Label>
                <Input
                  id="zipCode"
                  value={form.values.zipCode}
                  onChange={e => form.setValue('zipCode', e.target.value)}
                  required
                  autoComplete="postal-code"
                />
                {form.errors.zipCode && (
                  <p className="text-sm text-destructive">{form.errors.zipCode}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Link
            to="/account"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            Need to change your password?
          </Link>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!form.isDirty || form.saving}
              onClick={form.reset}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!form.isDirty || !form.isValid || form.saving}>
              {form.saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
