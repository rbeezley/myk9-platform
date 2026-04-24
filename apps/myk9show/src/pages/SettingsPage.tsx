import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Bell,
  CreditCard,
  Dog,
  Download,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Camera,
  Loader2,
  ChevronRight,
} from 'lucide-react';
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
import type { Dog as DogType } from '@/types/dog-types';

type Section = 'profile' | 'notifications' | 'payment' | 'dogs' | 'exports' | 'delete';

const NAV_ITEMS: { key: Section; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'payment', label: 'Payment methods', icon: CreditCard },
  { key: 'dogs', label: 'Linked dogs', icon: Dog },
  { key: 'exports', label: 'API & exports', icon: Download },
  { key: 'delete', label: 'Delete account', icon: Trash2 },
];

// ── Profile section ─────────────────────────────────────────────────────────

function ProfileSection() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { upload, uploading } = useAvatarUpload({
    userId: form.personId || '',
    onSuccess: publicUrl => {
      if (form.person) {
        updatePerson.mutate({ ...form.person, profileImage: publicUrl });
      }
    },
  });

  const avatarUrl = form.person?.profileImage;
  const fullName = `${form.person?.firstName || ''} ${form.person?.lastName || ''}`.trim();

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
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
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG, WebP · max 2 MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name & contact */}
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
                className="col-span-1"
                value={form.values.city}
                onChange={e => form.setValue('city', e.target.value)}
              />
              <Input
                placeholder="State"
                className="col-span-1"
                value={form.values.state}
                onChange={e => form.setValue('state', e.target.value)}
              />
              <Input
                placeholder="ZIP"
                className="col-span-1"
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

// ── Notifications section ────────────────────────────────────────────────────

function NotificationsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Control which notifications you receive from myK9Show.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/preferences">
            Notification preferences
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
        <div className="pt-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/notifications">View notification history</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Payment section ──────────────────────────────────────────────────────────

function PaymentSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment methods</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground py-4 text-center">
          No payment methods saved. Payment information is collected at checkout via Stripe.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Linked dogs section ──────────────────────────────────────────────────────

function LinkedDogsSection() {
  const { data: rawDogs, isLoading } = useDogsQuery();
  const dogs = (rawDogs ?? []) as unknown as DogType[];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

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

// ── Exports section ──────────────────────────────────────────────────────────

function ExportsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API & exports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Export your entry history or access the myK9Show API.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/preferences">
            Manage integrations
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Delete section ───────────────────────────────────────────────────────────

function DeleteSection() {
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
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await signOut();
                }}
              >
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('profile');

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSection />;
      case 'notifications':
        return <NotificationsSection />;
      case 'payment':
        return <PaymentSection />;
      case 'dogs':
        return <LinkedDogsSection />;
      case 'exports':
        return <ExportsSection />;
      case 'delete':
        return <DeleteSection />;
    }
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>
        <div className="flex gap-8">
          {/* Left rail nav */}
          <nav className="w-52 shrink-0">
            <ul className="space-y-0.5">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                <li key={key}>
                  <button
                    onClick={() => setActiveSection(key)}
                    className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                      activeSection === key
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
