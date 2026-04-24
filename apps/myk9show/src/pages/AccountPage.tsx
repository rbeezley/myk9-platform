import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Bell,
  CreditCard,
  Dog,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Camera,
  Loader2,
  Palette,
  SlidersHorizontal,
  Shield,
  Lock,
  Wifi,
  Smartphone,
  Download,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Upload,
} from 'lucide-react';
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
import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { ThemeSelector } from '@/components/preferences/ThemeSelector';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { GeneralSettings } from '@/components/preferences/GeneralSettings';
import { PrivacySettings } from '@/components/preferences/PrivacySettings';
import { SecuritySettings } from '@/components/preferences/SecuritySettings';
import { DataSettings } from '@/components/preferences/DataSettings';
import { DeviceManager } from '@/components/preferences/DeviceManager';
import { InstallAppSettings } from '@/components/preferences/InstallAppSettings';
import type { Dog as DogType } from '@/types/dog-types';
import type { PreferencesUpdate } from '@/types/user-preferences';

type Section =
  | 'profile'
  | 'dogs'
  | 'payment'
  | 'appearance'
  | 'general'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'data'
  | 'devices'
  | 'install'
  | 'delete';

interface NavItem {
  key: Section;
  label: string;
  icon: React.FC<{ className?: string }>;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Your account',
    items: [
      { key: 'profile', label: 'Profile', icon: User },
      { key: 'dogs', label: 'Linked dogs', icon: Dog },
      { key: 'payment', label: 'Payment', icon: CreditCard },
    ],
  },
  {
    label: 'Display',
    items: [
      { key: 'appearance', label: 'Appearance', icon: Palette },
      { key: 'general', label: 'General', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Notifications',
    items: [{ key: 'notifications', label: 'Notifications', icon: Bell }],
  },
  {
    label: 'Privacy & security',
    items: [
      { key: 'privacy', label: 'Privacy', icon: Shield },
      { key: 'security', label: 'Security', icon: Lock },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { key: 'data', label: 'Data & sync', icon: Wifi },
      { key: 'devices', label: 'Devices', icon: Smartphone },
      { key: 'install', label: 'Install app', icon: Download },
    ],
  },
  {
    label: '',
    items: [{ key: 'delete', label: 'Delete account', icon: Trash2 }],
  },
];

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfileSection() {
  const form = useProfileForm();
  const updatePerson = useUpdatePerson();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useAvatarUpload({
    userId: form.personId || '',
    onSuccess: url => {
      if (form.person) updatePerson.mutate({ ...form.person, profileImage: url });
    },
  });
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

// ── Linked dogs ───────────────────────────────────────────────────────────────

function DogsSection() {
  const { data: rawDogs, isLoading } = useDogsQuery();
  const dogs = (rawDogs ?? []) as unknown as DogType[];
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

// ── Payment ───────────────────────────────────────────────────────────────────

function PaymentSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground py-4 text-center">
          No payment methods saved. Payment information is collected at checkout via Stripe.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Delete ────────────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [active, setActive] = useState<Section>('profile');
  const user = useAuthUser();
  const {
    preferences,
    loading: prefsLoading,
    syncState,
    devices,
    updatePreferences,
    resetToDefaults,
    exportPreferences,
    importPreferences,
  } = useUserPreferences(user?.id ?? null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };
  const flashErr = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleUpdate = async (updates: PreferencesUpdate) => {
    try {
      await updatePreferences(updates);
      flash('Saved');
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const handleReset = async (category?: keyof PreferencesUpdate) => {
    try {
      setActionLoading('reset');
      await resetToDefaults(category);
      flash(`${category ?? 'All preferences'} reset to defaults`);
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async () => {
    try {
      setActionLoading('export');
      const data = await exportPreferences();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
        download: `myK9Show-prefs-${new Date().toISOString().slice(0, 10)}.json`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      flash('Exported');
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await importPreferences(await file.text());
        flash('Imported');
      } catch (err) {
        flashErr(err instanceof Error ? err.message : 'Import failed');
      }
    };
    input.click();
  };

  const renderSection = () => {
    if (
      [
        'appearance',
        'general',
        'notifications',
        'privacy',
        'security',
        'data',
        'devices',
        'install',
      ].includes(active) &&
      prefsLoading
    ) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    switch (active) {
      case 'profile':
        return <ProfileSection />;
      case 'dogs':
        return <DogsSection />;
      case 'payment':
        return <PaymentSection />;
      case 'appearance':
        return (
          <ThemeSelector
            preferences={preferences?.theme}
            onUpdate={t => handleUpdate({ theme: t })}
            onReset={() => handleReset('theme')}
          />
        );
      case 'general':
        return <GeneralSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'privacy':
        return (
          <PrivacySettings
            preferences={preferences?.privacy}
            onUpdate={p => handleUpdate({ privacy: p })}
            onReset={() => handleReset('privacy')}
          />
        );
      case 'security':
        return <SecuritySettings />;
      case 'data':
        return (
          <DataSettings
            preferences={preferences?.data}
            onUpdate={d => handleUpdate({ data: d })}
            onReset={() => handleReset('data')}
          />
        );
      case 'devices':
        return <DeviceManager devices={devices} syncState={syncState} />;
      case 'install':
        return <InstallAppSettings />;
      case 'delete':
        return <DeleteSection />;
    }
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-8">Account</h1>

        {successMsg && (
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}
        {errorMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-8">
          {/* Left rail */}
          <nav className="w-52 shrink-0">
            {NAV_GROUPS.map(group => (
              <div key={group.label || 'danger'} className="mb-4">
                {group.label && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {group.items.map(({ key, label, icon: Icon }) => (
                    <li key={key}>
                      <button
                        onClick={() => setActive(key)}
                        className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          active === key
                            ? key === 'delete'
                              ? 'bg-destructive/10 text-destructive font-medium'
                              : 'bg-primary/10 text-primary font-medium'
                            : key === 'delete'
                              ? 'text-destructive/70 hover:bg-destructive/5 hover:text-destructive'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Preference actions */}
            <div className="mt-4 pt-4 border-t border-border/50 space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={handleExport}
                disabled={!!actionLoading}
              >
                {actionLoading === 'export' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-2" />
                )}
                Export settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={handleImport}
                disabled={!!actionLoading}
              >
                {actionLoading === 'import' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-2" />
                )}
                Import settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={() => handleReset()}
                disabled={!!actionLoading}
              >
                {actionLoading === 'reset' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                )}
                Reset all settings
              </Button>
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
