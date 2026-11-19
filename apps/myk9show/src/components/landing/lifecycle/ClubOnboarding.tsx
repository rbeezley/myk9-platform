import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  ClubNameTakenError,
  TOO_MANY_CLUB_REQUESTS_MESSAGE,
  TooManyClubRequestsError,
  requestNewClub,
} from '@/services/database/club-access-requests.request';
import {
  clearClubOnboardingDraft,
  readClubOnboardingDraft,
  saveClubOnboardingDraft,
} from './clubOnboardingDraft';
import { buildClubOnboardingNote } from './clubOnboardingNote';
import { scopesHoldClubRole } from './clubRoleLoaded';
import { logger } from '@/services/LoggingService';
import {
  CLUB_NUMBER_HELP_TEXT,
  CLUB_NUMBER_LABEL,
  CLUB_NUMBER_REQUIRED_MESSAGE,
  CLUB_REGISTRY_ORGS,
  EMPTY_CLUB_REGISTRY_NUMBER_INPUTS,
  hasClubRegistryNumber,
  normalizeClubRegistryNumbers,
  type ClubRegistryNumberInputs,
} from '@/utils/clubRegistryNumbers';
import { FieldError, fieldErrorControlProps, useSubmitFieldErrors } from '@/components/forms';
import { buildSignInPathForRedirect } from '@/pages/SignInPage.helpers';
import { addYourClubPath, returnPathWithClub, safeReturnPath } from './landingCtas';

// Club-onboarding form for the marketing homepage. Restyled onto the editorial
// l-* system so it reads as one page with the lifecycle landing page. It reuses
// the `.l-waitlist` form styles (inputs, labels, buttons) and adds only a thin
// `.l-onboard` section shell in landing.css.
//
// MYK9-2046: submitting creates the club at once, waiting for myK9Show
// approval, and makes the signed-in requester its club admin and secretary
// (request_new_club, one transaction). Nothing is public until the owner
// approves. A visitor who is not signed in is sent to sign in first and comes
// back to the form with what she typed.

export function ClubOnboarding() {
  const { user, refreshPermissions, userWithRoles } = useAuthContext();
  const navigate = useNavigate();
  // The show wizard sends its own address here so a new host club leads back to the draft.
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));

  // Form state
  const [clubName, setClubName] = useState('');
  const [organization, setOrganization] = useState('');
  const [clubNumbers, setClubNumbers] = useState<ClubRegistryNumberInputs>(
    EMPTY_CLUB_REGISTRY_NUMBER_INPUTS
  );
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [firstShowDate, setFirstShowDate] = useState('');
  const [message, setMessage] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [nameTaken, setNameTaken] = useState(false);

  // MYK9-2214: the new club's role counts as loaded only when the auth context itself holds it
  // (the dashboard reads that, not a separate server read). Until then she stays here with a
  // plain line; the moment it arrives the draft goes and she is sent to the dashboard.
  const rolesLoaded = Boolean(
    createdClubId && scopesHoldClubRole(userWithRoles?.scopes, createdClubId)
  );
  const rolesPending = Boolean(createdClubId) && !rolesLoaded;
  useEffect(() => {
    if (!createdClubId || !rolesLoaded) return;
    clearClubOnboardingDraft();
    // Not when the wizard sent her here (returnTo leads back).
    if (!returnTo) navigate(`/secretary/dashboard?clubId=${encodeURIComponent(createdClubId)}`);
  }, [createdClubId, rolesLoaded, returnTo, navigate]);

  // Required-field and format errors sit under their own field; `error` keeps only
  // what belongs to no field (a failed submission).
  const firstClubNumberId = `onb-${CLUB_REGISTRY_ORGS[0].toLowerCase()}-number`;
  const errors: Record<string, string> = {};
  if (!clubName.trim()) errors['onb-club-name'] = 'Enter the club name.';
  if (!organization) errors['onb-organization'] = 'Choose an organization.';
  if (!hasClubRegistryNumber(clubNumbers)) errors[firstClubNumberId] = CLUB_NUMBER_REQUIRED_MESSAGE;
  if (!contactName.trim()) errors['onb-contact-name'] = 'Enter your name.';
  if (!contactEmail.trim()) errors['onb-contact-email'] = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    errors['onb-contact-email'] = 'Enter a valid email address.';
  }
  const { shown, fail } = useSubmitFieldErrors(errors);
  const clubNumberError = shown[firstClubNumberId];

  // Bring back what a signed-out visitor typed before she was sent to sign in.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = readClubOnboardingDraft();
    if (!draft) return;
    setClubName(draft.clubName);
    setOrganization(draft.organization);
    setClubNumbers(draft.clubNumbers);
    setContactName(draft.contactName);
    setContactEmail(draft.contactEmail);
    setContactPhone(draft.contactPhone);
    setFirstShowDate(draft.firstShowDate);
    setMessage(draft.message);
  }, []);

  // Pre-fill from the auth session, only into fields still empty (never over
  // what the visitor typed or a restored draft).
  const prefilled = useRef(false);
  useEffect(() => {
    if (user && !prefilled.current) {
      prefilled.current = true;
      const meta = user.user_metadata;
      const firstName = (meta?.firstName as string) ?? (meta?.first_name as string) ?? '';
      const lastName = (meta?.lastName as string) ?? (meta?.last_name as string) ?? '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      if (fullName) setContactName(current => current || fullName);
      if (user.email) setContactEmail(current => current || (user.email ?? ''));
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fail()) return;

    if (!user) {
      saveClubOnboardingDraft({
        clubName,
        organization,
        clubNumbers,
        contactName,
        contactEmail,
        contactPhone,
        firstShowDate,
        message,
      });
      navigate(buildSignInPathForRedirect(addYourClubPath(returnTo)));
      return;
    }

    setSubmitting(true);
    setError('');
    setNameTaken(false);

    try {
      const result = await requestNewClub({
        clubName: clubName.trim(),
        clubNumbers: normalizeClubRegistryNumbers(clubNumbers),
        note: buildClubOnboardingNote({
          organization,
          contactName,
          contactEmail,
          contactPhone,
          firstShowDate,
          message,
        }),
      });
      // She now holds club admin and secretary, which exempts her from the first-run
      // profile step. Ask for the new roles; the draft (the other exemption) stays until the
      // auth context actually holds the club (effect above). A failed refresh leaves her here.
      try {
        await refreshPermissions();
      } catch (refreshError) {
        logger.warn(
          'Roles refresh after club request failed',
          'onboarding',
          {},
          refreshError as Error
        );
      }
      setCreatedClubId(result.clubId);
    } catch (err) {
      if (err instanceof ClubNameTakenError) {
        setNameTaken(true);
      } else if (err instanceof TooManyClubRequestsError) {
        setError(TOO_MANY_CLUB_REQUESTS_MESSAGE);
      } else {
        const isAuthError = err instanceof Error && /401|403|JWT|auth/i.test(err.message);
        setError(
          isAuthError
            ? 'Your session has expired. Please sign in again.'
            : "We couldn't add your club. Try again."
        );
      }
      logger.error('Club request failed', 'onboarding', {}, err as Error);
    } finally {
      setSubmitting(false);
    }
  };

  // MYK9-2214: the recovery action retries the roles refresh; the effect above navigates only
  // once the new club's role is in the auth context, otherwise she keeps the same plain line.
  const retryRolesRefresh = async () => {
    setRetrying(true);
    try {
      await refreshPermissions();
    } catch (refreshError) {
      logger.warn('Roles retry after club request failed', 'onboarding', {}, refreshError as Error);
    } finally {
      setRetrying(false);
    }
  };

  // --- Card body: the form, or the confirmation once the club exists ---
  let card: React.ReactNode;

  if (createdClubId) {
    card = (
      <div className="l-onboard-card" role="status" aria-live="polite">
        <p className="l-success-title">Your club is waiting for myK9Show approval.</p>
        {rolesPending ? (
          <p data-testid="club-roles-pending">
            Your club was created. We couldn&apos;t load it yet; open your dashboard in a moment.
          </p>
        ) : null}
        <p>
          You can start now: build a draft show and connect the club&apos;s bank account. Nothing is
          public until we approve the club, usually within a day.
        </p>
        <div className="l-submit-row">
          {returnTo ? (
            <>
              <Link
                to={returnPathWithClub(returnTo, createdClubId)}
                className="l-btn l-btn-primary l-btn-lg inline-flex min-h-11 items-center"
              >
                Back to your show
              </Link>
              <Link
                to={`/clubs/${createdClubId}`}
                className="l-btn l-btn-ghost l-btn-lg inline-flex min-h-11 items-center"
              >
                Open your club
              </Link>
            </>
          ) : rolesPending ? (
            <button
              type="button"
              onClick={retryRolesRefresh}
              disabled={retrying}
              className="l-btn l-btn-primary l-btn-lg inline-flex min-h-11 items-center"
            >
              {retrying ? 'Loading your club…' : 'Get your first show published'}
            </button>
          ) : (
            <Link
              to={`/secretary/dashboard?clubId=${encodeURIComponent(createdClubId)}`}
              className="l-btn l-btn-primary l-btn-lg inline-flex min-h-11 items-center"
            >
              Get your first show published
            </Link>
          )}
        </div>
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
              onChange={e => {
                setClubName(e.target.value);
                setNameTaken(false);
              }}
              placeholder="e.g. Tri-State Kennel Club"
              required
              {...fieldErrorControlProps('onb-club-name', shown['onb-club-name'])}
            />
            <FieldError field="onb-club-name" message={shown['onb-club-name']} />
            {nameTaken && (
              <p className="l-error" role="alert" data-testid="club-name-taken">
                A club with this name is already on myK9Show. If it&apos;s yours, ask its admin to
                add you, or <a href="mailto:support@myk9show.com">email us</a>.
              </p>
            )}
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
              {...fieldErrorControlProps('onb-organization', shown['onb-organization'])}
            >
              <option value="">Select organization…</option>
              {CLUB_REGISTRY_ORGS.map(org => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
            <FieldError field="onb-organization" message={shown['onb-organization']} />
          </div>

          <fieldset className="l-field-stack">
            <legend className="l-lbl">Club numbers</legend>
            <p id="onb-club-numbers-help" className="l-fineprint">
              {CLUB_NUMBER_HELP_TEXT}
            </p>
            {CLUB_REGISTRY_ORGS.map(org => (
              <div key={org}>
                <label className="l-lbl" htmlFor={`onb-${org.toLowerCase()}-number`}>
                  {CLUB_NUMBER_LABEL[org]}
                </label>
                <input
                  id={`onb-${org.toLowerCase()}-number`}
                  className="l-pill-input"
                  type="text"
                  value={clubNumbers[org]}
                  onChange={e => setClubNumbers(prev => ({ ...prev, [org]: e.target.value }))}
                  maxLength={50}
                  autoComplete="off"
                  {...fieldErrorControlProps(
                    org === CLUB_REGISTRY_ORGS[0] ? firstClubNumberId : '',
                    org === CLUB_REGISTRY_ORGS[0] ? clubNumberError : undefined,
                    'onb-club-numbers-help'
                  )}
                />
                {org === CLUB_REGISTRY_ORGS[0] && (
                  <FieldError field={firstClubNumberId} message={shown[firstClubNumberId]} />
                )}
              </div>
            ))}
          </fieldset>

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
                {...fieldErrorControlProps('onb-contact-name', shown['onb-contact-name'])}
              />
              <FieldError field="onb-contact-name" message={shown['onb-contact-name']} />
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
                {...fieldErrorControlProps('onb-contact-email', shown['onb-contact-email'])}
              />
              <FieldError field="onb-contact-email" message={shown['onb-contact-email']} />
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
          <button
            type="submit"
            className="l-btn l-btn-primary l-btn-lg min-h-11"
            disabled={submitting}
          >
            {submitting ? 'Adding your club…' : user ? 'Add my club' : 'Sign in to add my club'}
          </button>
        </div>
        <p className="l-fineprint">
          {user
            ? 'Your club is created right away. We review every new club before anything goes public.'
            : 'You will sign in or create a free account first, then come straight back to this form.'}
        </p>
        <p className="l-fineprint">
          Is your club already on myK9Show? Ask its admin to add you, or{' '}
          <Link to="/request-access" className="l-btn-text inline-flex min-h-11 items-center">
            find your club
          </Link>
          .
        </p>
      </form>
    );
  }

  return (
    <section className="l-onboard" id="get-started">
      <div className="l-container">
        <span className="l-eyebrow">For clubs &amp; secretaries</span>
        <h2>
          Add your club to <em>myK9Show</em>.
        </h2>
        <p>
          Tell us about your club and start building your first show right away. We review every new
          club before anything goes public. Works for AKC, UKC, and ASCA.
        </p>
        {card}
      </div>
    </section>
  );
}
