import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ONBOARDING_ORGANIZATIONS } from '@/data/organizations';
import {
  submitOnboardingRequest,
  getMyOnboardingRequests,
  type OnboardingRequest,
} from '@/services/database/onboarding-requests';
import { logger } from '@/services/LoggingService';
import { buildSignInPathForRedirect, buildSignUpPathForRedirect } from '@/pages/SignInPage.helpers';

// Club-onboarding lead form for the marketing homepage. Restyled onto the
// editorial l-* system so it reads as one page with the waitlist / feature
// sections — it reuses the `.l-waitlist` form styles (inputs, labels,
// buttons) and adds only a thin `.l-onboard` section shell in landing.css.
//
// A submission writes a `pending` row to `onboarding_requests`; the team
// works the pending → contacted → onboarded queue by hand. The form is
// idempotent per user: an existing pending/contacted request shows a
// status card instead of the form.

export function ClubOnboarding() {
  const { user } = useAuthContext();
  const navigate = useNavigate();

  // Form state
  const [clubName, setClubName] = useState('');
  const [organization, setOrganization] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [firstShowDate, setFirstShowDate] = useState('');
  const [message, setMessage] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [existingRequest, setExistingRequest] = useState<OnboardingRequest | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Pre-fill from auth session (only once to avoid overwriting user edits)
  const prefilled = useRef(false);
  useEffect(() => {
    if (user && !prefilled.current) {
      prefilled.current = true;
      const meta = user.user_metadata;
      const firstName = (meta?.firstName as string) ?? (meta?.first_name as string) ?? '';
      const lastName = (meta?.lastName as string) ?? (meta?.last_name as string) ?? '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      if (fullName) setContactName(fullName);
      if (user.email) setContactEmail(user.email);
    }
  }, [user]);

  // Check for existing pending/contacted request
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setCheckingExisting(true);

    getMyOnboardingRequests()
      .then(requests => {
        if (cancelled) return;
        const active = requests.find(r => r.status === 'pending' || r.status === 'contacted');
        setExistingRequest(active ?? null);
      })
      .catch(err => {
        if (!cancelled) {
          logger.warn('Failed to check existing onboarding requests', 'onboarding', {}, err);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSignIn = useCallback(() => {
    navigate(buildSignInPathForRedirect('/?onboarding=true#get-started'));
  }, [navigate]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;

      // Validate
      if (!clubName.trim()) {
        setError('Club name is required.');
        return;
      }
      if (!organization) {
        setError('Please select an organization.');
        return;
      }
      if (!contactName.trim()) {
        setError('Contact name is required.');
        return;
      }
      if (!contactEmail.trim()) {
        setError('Contact email is required.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        setError('Please enter a valid email address.');
        return;
      }

      setSubmitting(true);
      setError('');

      try {
        await submitOnboardingRequest({
          authUserId: user.id,
          clubName: clubName.trim(),
          organization,
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          firstShowDate: firstShowDate || undefined,
          message: message.trim() || undefined,
        });
        setSubmitted(true);
      } catch (err) {
        const isAuthError = err instanceof Error && /401|403|JWT|auth/i.test(err.message);
        const isDuplicateRequest =
          typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
        if (isDuplicateRequest) {
          setError('You already have a request under review.');
        } else if (isAuthError) {
          setError('Your session has expired. Please sign in again.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        logger.error('Onboarding request submission failed', 'onboarding', {}, err as Error);
      } finally {
        setSubmitting(false);
      }
    },
    [user, clubName, organization, contactName, contactEmail, contactPhone, firstShowDate, message]
  );

  // --- Card body: switches on auth / request state ---
  let card: React.ReactNode;

  if (!user) {
    // Sign-in gate for unauthenticated visitors.
    card = (
      <div className="l-onboard-card">
        {/* Visual-only title — a <p>, not <h*>, to avoid a heading-level
            skip under the section's own <h2>. */}
        <p className="l-success-title">Create your free account</p>
        <p>
          Requesting club onboarding takes a myK9Show account — it's free. Sign in or sign up, then
          your request form will be ready when you return.
        </p>
        <div className="l-submit-row">
          <button type="button" className="l-btn l-btn-primary l-btn-lg" onClick={handleSignIn}>
            Sign in to get started
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="l-fineprint">
          Don't have an account?{' '}
          <button
            type="button"
            className="l-btn-text"
            onClick={() => navigate(buildSignUpPathForRedirect('/?onboarding=true#get-started'))}
          >
            Create one for free
          </button>
        </p>
      </div>
    );
  } else if (checkingExisting) {
    card = (
      <div className="l-onboard-card" aria-busy="true">
        <p className="l-onboard-loading">Checking request status…</p>
      </div>
    );
  } else if (existingRequest) {
    const submittedDate = new Date(existingRequest.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    card = (
      <div className="l-onboard-card" role="status" aria-live="polite">
        <p className="l-success-title">Request under review</p>
        <p>
          Your onboarding request for <strong>{existingRequest.clubName}</strong> is being reviewed.
        </p>
        <p className="l-fineprint">
          Submitted {submittedDate} · Status:{' '}
          <span className="l-onboard-status">{existingRequest.status}</span>
        </p>
      </div>
    );
  } else if (submitted) {
    card = (
      <div className="l-onboard-card" role="status" aria-live="polite">
        <p className="l-success-title">Request submitted.</p>
        <p>
          Thanks for your interest — we'll review your request and get back to you, usually within
          24 hours.
        </p>
      </div>
    );
  } else {
    card = (
      <form className="l-waitlist l-onboard-form" onSubmit={handleSubmit} noValidate>
        <div className="l-field-stack">
          <div>
            <label className="l-lbl" htmlFor="onb-club-name">
              Club name
            </label>
            <input
              id="onb-club-name"
              className="l-pill-input"
              type="text"
              value={clubName}
              onChange={e => setClubName(e.target.value)}
              placeholder="e.g. Tri-State Kennel Club"
              required
            />
          </div>

          <div>
            <label className="l-lbl" htmlFor="onb-organization">
              Organization
            </label>
            <select
              id="onb-organization"
              className="l-pill-input"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              required
            >
              <option value="">Select organization…</option>
              {ONBOARDING_ORGANIZATIONS.map(org => (
                <option key={org.value} value={org.value}>
                  {org.label}
                </option>
              ))}
            </select>
          </div>

          <div className="l-onboard-row">
            <div>
              <label className="l-lbl" htmlFor="onb-contact-name">
                Contact name
              </label>
              <input
                id="onb-contact-name"
                className="l-pill-input"
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className="l-lbl" htmlFor="onb-contact-email">
                Contact email
              </label>
              <input
                id="onb-contact-email"
                className="l-pill-input"
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="l-onboard-row">
            <div>
              <label className="l-lbl" htmlFor="onb-phone">
                Phone <span className="l-onboard-optional">(optional)</span>
              </label>
              <input
                id="onb-phone"
                className="l-pill-input"
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="l-lbl" htmlFor="onb-show-date">
                First show date <span className="l-onboard-optional">(optional)</span>
              </label>
              <input
                id="onb-show-date"
                className="l-pill-input"
                type="date"
                value={firstShowDate}
                onChange={e => setFirstShowDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="l-lbl" htmlFor="onb-message">
              Message <span className="l-onboard-optional">(optional)</span>
            </label>
            <textarea
              id="onb-message"
              className="l-pill-input l-onboard-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Anything else you'd like us to know?"
              rows={3}
            />
          </div>
        </div>

        {error && <p className="l-error">{error}</p>}

        <div className="l-submit-row">
          <button type="submit" className="l-btn l-btn-primary l-btn-lg" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <p className="l-fineprint">
          No obligation — this just starts a conversation. We'll only email you about your request.
        </p>
      </form>
    );
  }

  return (
    <section className="l-onboard" id="get-started">
      <div className="l-container">
        <span className="l-eyebrow">For clubs &amp; secretaries</span>
        <h2>
          Run your next trial on <em>myK9Show</em>.
        </h2>
        <p>
          Bringing your club aboard is a quick request, not a migration. Tell us who you are and
          we'll get you set up — across AKC, UKC, and ASCA.
        </p>
        {card}
      </div>
    </section>
  );
}
