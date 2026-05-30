import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, ShieldCheck, Gavel, ClipboardList, Dog } from 'lucide-react';

/**
 * /help/credentials — explains the two ways to get into myK9Show:
 *
 *   1. A normal account (email + password) — the full platform.
 *   2. A 5-character ring passcode — fast, account-free access to the
 *      at-show ringside experience for a single show.
 *
 * Ship-blocker per docs/plans/phase-1-atshow-mount.md (Phase 1f): when the
 * smart-input landing accepts "email OR passcode", people need one canonical
 * place that explains what a passcode is, where it came from, and what each
 * prefix means. Self-contained and static on purpose — no fetch, no auth.
 */

interface RoleRow {
  prefix: string;
  example: string;
  icon: React.ComponentType<{ className?: string }>;
  role: string;
  blurb: string;
}

const ROLE_ROWS: RoleRow[] = [
  {
    prefix: 'a',
    example: 'aa260',
    icon: ShieldCheck,
    role: 'Administrator',
    blurb: 'Full ring access — manage classes, run order, check-in, scoring, and view every passcode.',
  },
  {
    prefix: 'j',
    example: 'j9f3b',
    icon: Gavel,
    role: 'Judge',
    blurb: 'Score the class and run the scoresheet, adjust run order, and check dogs in.',
  },
  {
    prefix: 's',
    example: 's4k71',
    icon: ClipboardList,
    role: 'Steward',
    blurb: 'Keep the ring moving — adjust run order and check dogs in. No scoring.',
  },
  {
    prefix: 'e',
    example: 'e8d02',
    icon: Dog,
    role: 'Exhibitor',
    blurb: 'Check your dog in and follow the ring. View-only for everything else.',
  },
];

const CredentialsHelpPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            &larr; Back to myK9Show
          </Link>
        </div>

        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Email or passcode?
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            There are two ways to sign in to myK9Show. Most people use an email and
            password. At a show, you can also use a short passcode for instant,
            account-free access to the ring.
          </p>
        </header>

        {/* Two-path explainer */}
        <div className="mb-12 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-foreground">Your account</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              An email address and password. This is your home in myK9Show — your dogs,
              entries, results, and history all live here, show after show.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-foreground">A show passcode</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A <strong>5-character code</strong> the secretary hands out for a single
              show — like{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                aa260
              </code>
              . No account needed. Drops you straight into the ring with exactly the
              access your role needs.
            </p>
          </section>
        </div>

        {/* How a passcode reads */}
        <section className="mb-12">
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            How to read a passcode
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            Every passcode is exactly five characters. The{' '}
            <strong>first letter is your role</strong>; the four characters after it
            are the show-specific secret code. So{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              aa260
            </code>{' '}
            is an <strong>admin</strong> passcode because it starts with{' '}
            <code className="font-mono">a</code>.
          </p>

          <ul className="space-y-3">
            {ROLE_ROWS.map(({ prefix, example, icon: Icon, role, blurb }) => (
              <li
                key={prefix}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-foreground">{role}</span>
                    <span className="text-sm text-muted-foreground">
                      starts with{' '}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                        {prefix}
                      </code>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      e.g.{' '}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                        {example}
                      </code>
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {blurb}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Practical notes */}
        <section className="mb-12">
          <h2 className="mb-3 text-xl font-semibold text-foreground">Good to know</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span aria-hidden className="select-none text-primary">
                &bull;
              </span>
              <span>
                Passcodes aren&apos;t case-sensitive — <code className="font-mono">AA260</code>{' '}
                and <code className="font-mono">aa260</code> are the same code.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="select-none text-primary">
                &bull;
              </span>
              <span>
                A passcode is tied to one show. Your account follows you everywhere; a
                passcode does not.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="select-none text-primary">
                &bull;
              </span>
              <span>
                Don&apos;t have your code? Ask the show secretary — they generate and hand
                out passcodes for the event.
              </span>
            </li>
          </ul>
        </section>

        {/* Footer actions */}
        <div className="flex flex-wrap gap-3 border-t border-border pt-8">
          <Link
            to="/sign-in"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to sign in
          </Link>
          <Link
            to="/"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CredentialsHelpPage;
