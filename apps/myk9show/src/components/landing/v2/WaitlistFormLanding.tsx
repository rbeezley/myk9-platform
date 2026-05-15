import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

// INTENT: keep the landing form low-friction. Email is the only required
// field; role is a single-select pill row to keep visual density tight.
// More-detailed targeting (sports, current_system, switch_reason) is
// intentionally not collected here — we'd rather have a clean email than
// scare people off with a six-field form on the marketing surface.

type Role = 'exhibitor' | 'club_official' | 'judge';

interface WaitlistFormLandingProps {
  source?: string;
  showCounter?: boolean;
  /** Optional id used by the closing-section variant for in-page anchoring. */
  formId?: string;
  /** Heading text shown inside the card; defaults to "Join the waitlist". */
  title?: string;
  /** Optional ref so callers can scroll/focus the email input. */
  emailInputId?: string;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const ROLE_DB_VALUE: Record<Role, string> = {
  exhibitor: 'exhibitor',
  club_official: 'club_official',
  judge: 'judge',
};

export function WaitlistFormLanding({
  source = 'myk9show.com',
  formId,
  title = 'Join the waitlist',
  emailInputId = 'l-wl-email',
}: WaitlistFormLandingProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('exhibitor');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setState({ kind: 'error', message: 'Email is required.' });
      return;
    }
    setState({ kind: 'submitting' });

    // TODO(post-197-push): drop this cast once migration 197 is pushed and
    // `pnpm supabase:gen-types` is re-run — at that point Database['public']
    // ['Tables'] will include 'platform_waitlist' and the typed client will
    // accept these field names directly.
    //
    // Schema source of truth: supabase/migrations/197_create_platform_waitlist.sql
    const { error } = await (supabase as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { code?: string } | null }>;
      };
    })
      .from('platform_waitlist')
      .insert({
        email: email.trim().toLowerCase(),
        name: name.trim() || null,
        role: ROLE_DB_VALUE[role],
        source,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });

    if (error) {
      // 23505 = unique-violation on email. They're already on the list —
      // that's a successful outcome from the user's perspective.
      if (error.code === '23505') {
        setState({ kind: 'success' });
        return;
      }
      setState({
        kind: 'error',
        message: 'Something went wrong. Please try again in a moment.',
      });
      return;
    }

    setState({ kind: 'success' });
  };

  if (state.kind === 'success') {
    return (
      <div className="l-waitlist-success" role="status" aria-live="polite">
        <h3>You're on the list.</h3>
        <p>
          Thanks — we'll send you an update when there's news worth sharing. No spam, no
          marketing blasts. Just real updates on myK9Show.
        </p>
      </div>
    );
  }

  return (
    <form className="l-waitlist" onSubmit={handleSubmit} id={formId} noValidate>
      <div className="l-form-head">
        <h3 className="l-form-title">{title}</h3>
      </div>
      <div className="l-field-stack">
        <div>
          <label className="l-lbl" htmlFor={`${emailInputId}-name`}>
            Your name
          </label>
          <input
            className="l-pill-input"
            type="text"
            id={`${emailInputId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First & last name"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="l-lbl" htmlFor={emailInputId}>
            Email
          </label>
          <input
            className="l-pill-input"
            type="email"
            id={emailInputId}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <span className="l-lbl">I'm a…</span>
          <div className="l-roles" role="radiogroup" aria-label="I am a">
            {(
              [
                { value: 'exhibitor', label: 'Exhibitor' },
                { value: 'club_official', label: 'Club / secretary' },
                { value: 'judge', label: 'Judge' },
              ] as const
            ).map((opt) => (
              <label key={opt.value}>
                <input
                  type="radio"
                  name={`${emailInputId}-role`}
                  value={opt.value}
                  checked={role === opt.value}
                  onChange={() => setRole(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {state.kind === 'error' && <p className="l-error">{state.message}</p>}

      <div className="l-submit-row">
        <button
          type="submit"
          className="l-btn l-btn-primary l-btn-lg"
          disabled={state.kind === 'submitting'}
        >
          {state.kind === 'submitting' ? 'Joining…' : 'Join the waitlist'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="l-fineprint">
        We'll only email you when there's something to say. No marketing blasts, ever.
      </p>
    </form>
  );
}
