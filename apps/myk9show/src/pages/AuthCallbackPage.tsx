import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'magiclink' | null;
    return tokenHash && type ? { tokenHash, type } : null;
  }, [searchParams]);

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
        if (params.type === 'recovery') {
          navigate('/reset-password', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      });
  }, [params, navigate]);

  // Handle OAuth redirect (no OTP params — session is picked up by onAuthStateChange)
  useEffect(() => {
    if (params) return; // OTP flow handles its own navigation

    // Check if user is already authenticated (OAuth session was picked up)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true });
      }
    });

    // Listen for auth state changes (OAuth callback may still be processing)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/', { replace: true });
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
  }, [params, navigate]);

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
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Verifying your email...</p>
    </div>
  );
};

export default AuthCallbackPage;
