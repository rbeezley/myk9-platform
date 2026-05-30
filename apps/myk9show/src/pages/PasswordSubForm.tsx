import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';

/**
 * PasswordSubForm — the password step shared by `/sign-in` and the Phase 1b
 * smart-input email branch.
 *
 * Factored verbatim out of `SignInPage` (password field + show/hide toggle,
 * error region, submit button with spinner, and the forgot-password link) so
 * both surfaces consume one implementation (DRY). The parent owns the
 * surrounding `<form onSubmit>` and the email/credential field above it; this
 * component renders only the password-and-submit portion.
 */
export interface PasswordSubFormProps {
  password: string;
  onPasswordChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  isLoading: boolean;
  error?: string | undefined;
  /** Submit button label (default "Sign in"). */
  submitLabel?: string;
  /** Submit button label while loading (default "Signing in..."). */
  loadingLabel?: string;
}

export const PasswordSubForm: React.FC<PasswordSubFormProps> = ({
  password,
  onPasswordChange,
  showPassword,
  onToggleShowPassword,
  isLoading,
  error,
  submitLabel = 'Sign in',
  loadingLabel = 'Signing in...',
}) => {
  return (
    <>
      <div className="mb-6">
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
            data-testid="password-input"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            className="w-full p-2 pl-10 pr-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
            required
          />
          <button
            type="button"
            onClick={onToggleShowPassword}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {error && <div className="text-destructive mb-4 text-center">{error}</div>}
      <button
        type="submit"
        data-testid="sign-in-button"
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
            {loadingLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
      <div className="text-center mt-4">
        <Link to="/forgot-password" className="text-primary hover:underline text-sm font-medium">
          Forgot your password?
        </Link>
      </div>
    </>
  );
};
