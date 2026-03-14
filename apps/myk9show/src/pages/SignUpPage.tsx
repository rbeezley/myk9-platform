import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

const SignUp: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signUp, signInWithGoogle, loading: authLoading } = useAuthContext();
  const [googleLoading, setGoogleLoading] = useState(false);

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
    setError('');

    // Validation
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, { firstName: firstName.trim(), lastName: lastName.trim() });
      setEmailSent(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <Link
              to="/"
              className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
            >
              myK9Show
            </Link>
          </div>
          <Mail className="mx-auto h-12 w-12 text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-muted-foreground mb-4">
            We sent a confirmation link to <strong>{email}</strong>. Click the link in the email to
            activate your account.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Didn&apos;t receive it? Check your spam folder or try signing up again.
          </p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">Create an account</h2>
        <div className="text-muted-foreground text-center mb-6">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            Sign in
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
          {/* Name fields in a row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block mb-1 font-medium" htmlFor="firstName">
                First name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  id="firstName"
                  placeholder="First"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                  required
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div>
              <label className="block mb-1 font-medium" htmlFor="lastName">
                Last name
              </label>
              <input
                type="text"
                id="lastName"
                placeholder="Last"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full p-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

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
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block mb-1 font-medium" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-2 pl-10 pr-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="block mb-1 font-medium" htmlFor="confirmPassword">
              Confirm password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-2 pl-10 pr-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <div className="text-destructive mb-4 text-center">{error}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 dark:bg-primary/90 dark:text-white dark:hover:bg-primary/80"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating Account...
              </>
            ) : (
              'Sign up'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
