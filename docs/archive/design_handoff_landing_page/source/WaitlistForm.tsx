// ============================================================================
// WaitlistForm.tsx
// ============================================================================
// Drop this on the myK9Show landing page (and link to a hosted version from
// myk9t.com / myk9q.com with ?source= query param).
//
// Save as: apps/myk9show/src/components/marketing/WaitlistForm.tsx
// (or wherever your marketing/landing components live)
//
// Usage:
//   <WaitlistForm source="myk9show.com" />
//
// For the cross-site hosted page, read `source` from the URL:
//   const params = new URLSearchParams(window.location.search);
//   <WaitlistForm source={params.get('source') ?? 'myk9show.com'} />
// ============================================================================

import { useState } from 'react';
import { supabase } from '@/lib/supabase'; // adjust import path to your project

type Role =
  | 'club_official'
  | 'show_secretary'
  | 'exhibitor'
  | 'judge'
  | 'steward'
  | 'other';

type CurrentSystem =
  | 'mySWT'
  | 'myNWT'
  | 'mySCT'
  | 'myFCT'
  | 'myCFT'
  | 'myOBT'
  | 'myAGT'
  | 'secreterrier'
  | 'dogshow_com'
  | 'paper'
  | 'other'
  | 'none';

const SPORT_OPTIONS = [
  { value: 'akc_scent_work', label: 'AKC Scent Work' },
  { value: 'ukc_nosework', label: 'UKC Nosework' },
  { value: 'asca_scent_detection', label: 'ASCA Scent Detection' },
  { value: 'akc_fastcat', label: 'AKC FastCat' },
  { value: 'ukc_conformation', label: 'UKC Conformation' },
  { value: 'ukc_obedience', label: 'UKC Obedience' },
  { value: 'ukc_agility', label: 'UKC Agility' },
  { value: 'cpe_scent', label: 'CPE Scent' },
  { value: 'cpe_agility', label: 'CPE Agility' },
  { value: 'other', label: 'Other' },
] as const;

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'show_secretary', label: 'Show secretary' },
  { value: 'club_official', label: 'Club official' },
  { value: 'exhibitor', label: 'Exhibitor / competitor' },
  { value: 'judge', label: 'Judge' },
  { value: 'steward', label: 'Steward' },
  { value: 'other', label: 'Other' },
];

const CURRENT_SYSTEM_OPTIONS: { value: CurrentSystem; label: string }[] = [
  { value: 'mySWT', label: 'mySWT (AKC Scent Work)' },
  { value: 'myNWT', label: 'myNWT (UKC Nosework)' },
  { value: 'mySCT', label: 'mySCT (ASCA Scent Detection)' },
  { value: 'myFCT', label: 'myFCT (AKC FastCat)' },
  { value: 'myCFT', label: 'myCFT (UKC Conformation)' },
  { value: 'myOBT', label: 'myOBT (UKC Obedience)' },
  { value: 'myAGT', label: 'myAGT (UKC Agility)' },
  { value: 'secreterrier', label: 'SecretSecretary' },
  { value: 'dogshow_com', label: 'DogShow.com' },
  { value: 'paper', label: 'Paper entries' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: "Don't currently run trials" },
];

interface WaitlistFormProps {
  source: string; // 'myk9show.com', 'myk9t.com', 'myk9q.com', or a campaign id
  // INTENT: keep this component compact and welcoming — no fancy multi-step
  // wizard. The whole point is low-friction signup. Five fields max visible.
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function WaitlistForm({ source }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [sports, setSports] = useState<string[]>([]);
  const [currentSystem, setCurrentSystem] = useState<CurrentSystem | ''>('');
  const [switchReason, setSwitchReason] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  const toggleSport = (value: string) => {
    setSports((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setState({ kind: 'error', message: 'Email is required.' });
      return;
    }
    setState({ kind: 'submitting' });

    const { error } = await supabase.from('platform_waitlist').insert({
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      role: role || null,
      sports: sports.length > 0 ? sports : null,
      current_system: currentSystem || null,
      switch_reason: switchReason.trim() || null,
      source,
      user_agent: navigator.userAgent,
    });

    if (error) {
      // Postgres unique-violation error code is 23505 — treat as success
      // since the user is on the list either way.
      if (error.code === '23505') {
        setState({ kind: 'success' });
        return;
      }
      setState({
        kind: 'error',
        message:
          "Something went wrong. Please try again, or email Richard directly.",
      });
      return;
    }

    setState({ kind: 'success' });
  };

  if (state.kind === 'success') {
    return (
      <div className="waitlist-success">
        <h3>You're on the list.</h3>
        <p>
          Thanks — we'll send you an update when there's news worth sharing.
          No spam, no marketing blasts. Just real updates on myK9Show.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="waitlist-form">
      <div className="field">
        <label htmlFor="waitlist-email">Email *</label>
        <input
          id="waitlist-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      <div className="field">
        <label htmlFor="waitlist-name">Name</label>
        <input
          id="waitlist-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Optional"
        />
      </div>

      <div className="field">
        <label htmlFor="waitlist-role">I am a...</label>
        <select
          id="waitlist-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role | '')}
        >
          <option value="">Select one (optional)</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field">
        <legend>Sports I run or compete in (check all that apply)</legend>
        <div className="checkbox-grid">
          {SPORT_OPTIONS.map((opt) => (
            <label key={opt.value} className="checkbox-row">
              <input
                type="checkbox"
                checked={sports.includes(opt.value)}
                onChange={() => toggleSport(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="waitlist-current">What do you use today?</label>
        <select
          id="waitlist-current"
          value={currentSystem}
          onChange={(e) =>
            setCurrentSystem(e.target.value as CurrentSystem | '')
          }
        >
          <option value="">Select one (optional)</option>
          {CURRENT_SYSTEM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="waitlist-reason">
          What would make you switch to myK9Show? (optional)
        </label>
        <textarea
          id="waitlist-reason"
          value={switchReason}
          onChange={(e) => setSwitchReason(e.target.value)}
          rows={3}
          placeholder="Online entries, offline trial-day support, better catalog tools..."
        />
      </div>

      {state.kind === 'error' && (
        <p className="error">{state.message}</p>
      )}

      <button type="submit" disabled={state.kind === 'submitting'}>
        {state.kind === 'submitting' ? 'Joining...' : 'Join the Waitlist'}
      </button>

      <p className="fine-print">
        We'll only email you about myK9Show updates. No marketing blasts.
        Unsubscribe anytime.
      </p>
    </form>
  );
}
