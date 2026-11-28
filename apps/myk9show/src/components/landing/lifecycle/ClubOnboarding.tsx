import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  ClubNameTakenError,
  TOO_MANY_CLUB_REQUESTS_MESSAGE,
  TooManyClubRequestsError,
  requestNewClub,
} from '@/services/database/club-access-requests.request';
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
import {
  buildSignInPathForRedirect,
  buildSignUpPathForRedirect,
  isSignedIn,
} from '@/pages/SignInPage.helpers';
import { addYourClubPath, returnPathWithClub, safeReturnPath } from './landingCtas';

// Club-onboarding form for the marketing homepage. Restyled onto the editorial
// l-* system so it reads as one page with the lifecycle landing page. It reuses
// the `.l-waitlist` form styles (inputs, labels, buttons) and adds only a thin
// `.l-onboard` section shell in landing.css.
//
// MYK9-2046: submitting creates the club at once, waiting for myK9Show
// approval, and makes the signed-in requester its club admin and secretary
// (request_new_club, one transaction). Nothing is public until the owner
// approves. MYK9-2547: the form is for a signed-in visitor only. A visitor who is
// not signed in is asked to sign in or create her account first (the sign-in
// return path brings her back here, also from the confirmation email), so the
// form never holds anything across a sign-up and her contact details come from
// her account.

export function ClubOnboarding() {
  const { user, loading: authLoading, refreshPermissions, userWithRoles } = useAuthContext();
  const navigate = useNavigate();
  // The show wizard sends its own address here so a new host club leads back to the draft.
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));

  // Form state
  const [clubName, setClubName] = useState('');
  const [clubNumbers, setClubNumbers] = useState<ClubRegistryNumberInputs>(
    EMPTY_CLUB_REGISTRY_NUMBER_INPUTS
  );
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
  // plain line; the moment it arrives she is sent to the dashboard.
  const rolesLoaded = Boolean(
    createdClubId && scopesHoldClubRole(userWithRoles?.scopes, createdClubId)
  );
  const rolesPending = Boolean(createdClubId) && !rolesLoaded;
  useEffect(() => {
    if (!createdClubId || !rolesLoaded) return;
    // Not when the wizard sent her here (returnTo leads back).
    if (!returnTo) navigate(`/secretary/dashboard?clubId=${encodeURIComponent(createdClubId)}`);
  }, [createdClubId, rolesLoaded, returnTo, navigate]);

  // Required-field and format errors sit under their own field; `error` keeps only
  // what belongs to no field (a failed submission).
  const firstClubNumberId = `onb-${CLUB_REGISTRY_ORGS[0].toLowerCase()}-number`;
  const errors: Record<string, string> = {};
  if (!clubName.trim()) errors['onb-club-name'] = 'Enter the club name.';
  if (!hasClubRegistryNumber(clubNumbers)) errors[firstClubNumberId] = CLUB_NUMBER_REQUIRED_MESSAGE;
  const { shown, fail } = useSubmitFieldErrors(errors);
  const clubNumberError = shown[firstClubNumberId];

  // Contact name and email come from her account, never from typed fields.
  const meta = user?.user_metadata;
  const firstName = (meta?.firstName as string) ?? (meta?.first_name as string) ?? '';
  const lastName = (meta?.lastName as string) ?? (meta?.last_name as string) ?? '';
  const contactEmail = user?.email ?? '';
  const contactName = [firstName, lastName].filter(Boolean).join(' ') || contactEmail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fail()) return;

    if (!isSignedIn(user, authLoading)) return;

    setSubmitting(true);
    setError('');
    setNameTaken(false);

    try {
      const result = await requestNewClub({
        clubName: clubName.trim(),
        clubNumbers: normalizeClubRegistryNumbers(clubNumbers),
        note: buildClubOnboardingNote({
          clubNumbers: normalizeClubRegistryNumbers(clubNumbers),
          contactName,
          contactEmail,
          contactPhone,
          firstShowDate,
          message,
        }),
      });
      // She now holds club admin and secretary, which exempts her from the first-run
      // profile step. Ask for the new roles; she stays on this form's address (exempt too)
      // until the auth context actually holds the club (effect above). A failed refresh leaves her here.
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

  if (!createdClubId && !isSignedIn(user, authLoading)) {
    // The form is for a signed-in visitor: say why, then send her to sign in or sign up, which
    // brings her back to this form (also from the confirmation email, in a new tab).
    const comeBack = addYourClubPath(returnTo);
    card = authLoading ? null : (
      <div className="l-onboard-card" data-testid="club-sign-in-gate">
        <p className="l-success-title">Sign in or create your account to add your club.</p>
        <p>
          Adding a club makes you its admin and secretary, so it needs an account. You will come
          straight back to the form.
        </p>
        <div className="l-submit-row">
          <Link
            to={buildSignInPathForRedirect(comeBack)}
            className="l-btn l-btn-primary l-btn-lg inline-flex min-h-11 items-center"
          >
            Sign in
          </Link>
          <Link
            to={buildSignUpPathForRedirect(comeBack)}
            className="l-btn l-btn-ghost l-btn-lg inline-flex min-h-11 items-center"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  } else if (createdClubId) {
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
            {submitting ? 'Adding your club…' : 'Add my club'}
          </button>
        </div>
        <p className="l-fineprint">
          Your club is created right away, under {contactEmail}. We review every new club before
          anything goes public.
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
