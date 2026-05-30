import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { getSignInReturnTo } from './SignInPage.helpers';
import { PasswordSubForm } from './PasswordSubForm';

const SignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signInWithGoogle, loading: authLoading } = useAuthContext();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Show loading indicator if either local loading or authLoading is true
  const isLoading = loading || authLoading;

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signIn(email, password);
      navigate(getSignInReturnTo(searchParams));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2 pt-20">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">Sign in to your account</h2>
        <div className="text-muted-foreground text-center mb-6">
          Don't have an account?{' '}
          <Link to="/sign-up" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </div>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading || googleLoading}
          className="w-full flex items-center justify-center gap-3 border border-input bg-background text-foreground py-2 px-4 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <GoogleIcon className="h-5 w-5" />
          Continue with Google
        </button>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-input" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1 font-medium" htmlFor="email">
              Email address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Mail size={18} />
              </span>
              <input
                type="email"
                id="email"
                data-testid="email-input"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
              />
            </div>
          </div>
          <PasswordSubForm
            password={password}
            onPasswordChange={setPassword}
            showPassword={showPassword}
            onToggleShowPassword={() => setShowPassword(prev => !prev)}
            isLoading={isLoading}
            error={error}
          />
        </form>
      </div>
    </div>
  );
};

export default SignIn;
