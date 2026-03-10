import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await resetPassword(email);
      setSubmitted(true);
    } catch (err) {
      // Network errors — show generic error so user knows to retry
      // Auth errors (user not found, etc.) — show success to prevent enumeration
      if (
        err instanceof Error &&
        (err.name === 'FetchError' || err.message === 'Failed to fetch')
      ) {
        setError('Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2">
        <div
          className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center"
          aria-live="polite"
        >
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-muted-foreground mb-6">
            We sent a password reset link to your email address. The link will expire in 24 hours.
          </p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Back to sign in
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
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">Reset your password</h2>
        <p className="text-muted-foreground text-center mb-6">
          Enter your email and we&apos;ll send you a reset link
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
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
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
              />
            </div>
          </div>
          {error && <div className="text-destructive mb-4 text-center">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 dark:bg-primary/90 dark:text-white dark:hover:bg-primary/80"
          >
            {loading ? (
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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Sending...
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>
        <div className="text-center mt-6">
          <span className="text-muted-foreground">Remember your password? </span>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
