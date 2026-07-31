import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { supabase } from '@/lib/supabase';
import {
  buildSignInPathForRedirect,
  consumePersistedSignInRedirect,
  getSignInReturnTo,
} from './SignInPage.helpers';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hasNavigatedAfterOAuth = useRef(false);

  const params = useMemo(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'magiclink' | 'invite' | null;
    return tokenHash && type ? { tokenHash, type } : null;
  }, [searchParams]);
  const redirectTarget = useMemo(() => getSignInReturnTo(searchParams), [searchParams]);
  const oauthRedirectTarget = useMemo(
    () => (searchParams.has('redirectTo') || searchParams.has('returnTo') ? redirectTarget : null),
    [redirectTarget, searchParams]
  );
  const signInPath = useMemo(
    () =>
      searchParams.has('redirectTo') || searchParams.has('returnTo')
        ? buildSignInPathForRedirect(redirectTarget)
        : '/sign-in',
    [redirectTarget, searchParams]
  );

  // Handle OTP verification (email confirm, password reset)
  useEffect(() => {
    if (!params) return;

    supabase.auth
      .verifyOtp({ token_hash: params.tokenHash, type: params.type })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError('This link may have expired. Please request a new one.');
          return;
        }
        // `invite` belongs with `recovery`, not with the general case: an
        // admin-invited account (MYK9-131) has NO password. Falling through to
        // redirectTarget would sign them in once and strand them — they could
        // never sign in again after that session expired, despite the
        // invitation email telling them to choose a password.
        if (params.type === 'recovery' || params.type === 'invite') {
          navigate('/reset-password', { replace: true });
        } else {
          navigate(redirectTarget, { replace: true });
        }
      });
  }, [params, navigate, redirectTarget]);

  // Handle OAuth redirect (no OTP params — session is picked up by onAuthStateChange)
  useEffect(() => {
    if (params) return; // OTP flow handles its own navigation

    const navigateAfterOAuth = () => {
      if (hasNavigatedAfterOAuth.current) return;
      hasNavigatedAfterOAuth.current = true;
      navigate(oauthRedirectTarget ?? consumePersistedSignInRedirect() ?? '/', { replace: true });
    };

    // Check if user is already authenticated (OAuth session was picked up)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigateAfterOAuth();
      }
    });

    // Listen for auth state changes (OAuth callback may still be processing)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigateAfterOAuth();
      }
    });

    // Timeout: if no auth event after 10 seconds, show error
    const timeout = setTimeout(() => {
      setError('Authentication timed out. Please try again.');
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [params, navigate, oauthRedirectTarget]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Verification Failed</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link to={signInPath} className="text-primary hover:underline font-medium">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Verifying your email"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-xl">
        <Skeleton className="mx-auto h-12 w-12 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto h-4 w-64 max-w-full" />
      </div>
    </div>
  );
};

export default AuthCallbackPage;
