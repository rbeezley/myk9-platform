import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const params = useMemo(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'magiclink' | null;
    return tokenHash && type ? { tokenHash, type } : null;
  }, [searchParams]);

  const [error, setError] = useState<string | null>(
    params ? null : 'Invalid or missing verification link.'
  );

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
