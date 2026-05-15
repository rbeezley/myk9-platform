import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Send, CheckCircle2, LogIn, Clock } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ORGANIZATIONS } from '@/components/shows/wizard/steps/ShowDetailsStep.types';
import {
  submitOnboardingRequest,
  getMyOnboardingRequests,
  type OnboardingRequest,
} from '@/services/database/onboarding-requests';
import { logger } from '@/services/LoggingService';

export default function ClubOnboardingForm() {
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

    getMyOnboardingRequests(user.id)
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
    navigate('/sign-in?returnTo=/?onboarding=true%23get-started');
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
        if (isAuthError) {
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

  // --- Render states ---

  // Sign-in gate for unauthenticated users
  if (!user) {
    return (
      <section id="get-started" className="py-16 md:py-24 bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-12 shadow-lg backdrop-blur-xl text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Get Your Club Started
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              Create your free account to request club onboarding. We'll get you set up — usually
              within 24 hours.
            </p>
            <button
              onClick={handleSignIn}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-medium transition-colors text-lg"
            >
              <LogIn className="w-5 h-5" />
              Sign In to Get Started
            </button>
            <p className="text-sm text-muted-foreground mt-4">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/sign-up')}
                className="text-primary hover:underline font-medium"
              >
                Create one for free
              </button>
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Loading existing request check
  if (checkingExisting) {
    return (
      <section id="get-started" className="py-16 md:py-24 bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-12 shadow-lg backdrop-blur-xl text-center">
            <div className="animate-pulse text-muted-foreground">Checking request status...</div>
          </div>
        </div>
      </section>
    );
  }

  // Existing pending/contacted request
  if (existingRequest) {
    const submittedDate = new Date(existingRequest.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return (
      <section id="get-started" className="py-16 md:py-24 bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-12 shadow-lg backdrop-blur-xl text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500/20 to-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4">Request Under Review</h2>
            <p className="text-lg text-muted-foreground mb-2">
              Your onboarding request for{' '}
              <span className="font-semibold text-foreground">{existingRequest.clubName}</span> is
              being reviewed.
            </p>
            <p className="text-sm text-muted-foreground">
              Submitted on {submittedDate} · Status:{' '}
              <span className="capitalize font-medium text-foreground">
                {existingRequest.status}
              </span>
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Success state
  if (submitted) {
    return (
      <section id="get-started" className="py-16 md:py-24 bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-12 shadow-lg backdrop-blur-xl text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4">Request Submitted!</h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Thanks for your interest! We'll review your request and get back to you — usually
              within 24 hours.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Form
  return (
    <section id="get-started" className="py-16 md:py-24 bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Get Your Club Started
          </h2>
          <p className="text-xl text-muted-foreground">
            Tell us about your club and we'll get you set up — usually within 24 hours.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 md:p-10 shadow-lg backdrop-blur-xl space-y-6"
        >
          {/* Club Name */}
          <div>
            <label
              htmlFor="onb-club-name"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Club Name <span className="text-red-500">*</span>
            </label>
            <input
              id="onb-club-name"
              type="text"
              value={clubName}
              onChange={e => setClubName(e.target.value)}
              placeholder="e.g. Tri-State Kennel Club"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              required
            />
          </div>

          {/* Organization */}
          <div>
            <label
              htmlFor="onb-organization"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Organization <span className="text-red-500">*</span>
            </label>
            <select
              id="onb-organization"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              required
            >
              <option value="">Select organization...</option>
              {ORGANIZATIONS.map(org => (
                <option key={org.value} value={org.value}>
                  {org.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contact Name & Email — side by side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="onb-contact-name"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                id="onb-contact-name"
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                required
              />
            </div>
            <div>
              <label
                htmlFor="onb-contact-email"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                id="onb-contact-email"
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                required
              />
            </div>
          </div>

          {/* Phone & First Show Date — side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="onb-phone"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Phone <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <input
                id="onb-phone"
                type="tel"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="onb-show-date"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                First Show Date <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <input
                id="onb-show-date"
                type="date"
                value={firstShowDate}
                onChange={e => setFirstShowDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="onb-message"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Message <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <textarea
              id="onb-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Anything else you'd like us to know?"
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3.5 rounded-xl font-medium transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>Submitting...</>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Submit Request
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
