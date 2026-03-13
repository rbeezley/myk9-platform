import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionValid(!!session);
    });
  }, []);

  if (sessionValid === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Link Expired</h2>
          <p className="text-muted-foreground mb-6">
            This link has expired. Please request a new password reset.
          </p>
          <Link to="/forgot-password" className="text-primary hover:underline font-medium">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Password Updated</h2>
          <p className="text-muted-foreground mb-6">Your password has been updated successfully.</p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Sign in with new password
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link to="/" className="text-3xl font-bold text-primary hover:underline">
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Choose a new password</h2>
        <p className="text-muted-foreground text-center mb-6">Enter your new password below.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1 font-medium" htmlFor="new-password">
              New password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type="password"
                id="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                minLength={8}
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="block mb-1 font-medium" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
              />
            </div>
          </div>
          {error && <div className="text-destructive mb-4 text-center">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
