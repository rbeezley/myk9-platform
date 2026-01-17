import React, { useMemo } from 'react';
import { AlertTriangle, RefreshCw, Home, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DelightfulErrorProps {
  error?: Error;
  reset?: () => void;
  message?: string;
  showDetails?: boolean;
  variant?: 'page' | 'component' | 'inline';
}

const DelightfulError: React.FC<DelightfulErrorProps> = ({
  error,
  reset,
  message,
  showDetails = false,
  variant = 'component'
}) => {
  const handleRefresh = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  // Select message deterministically based on error message length to avoid Math.random()
  const randomMessage = useMemo(() => {
    const messages = [
      "Oops! Our digital dog got distracted by a squirrel!",
      "Woof! Something went a bit ruff...",
      "Our app is having a ruff day, but we're fetching a solution!",
      "Even the best dogs have their off days. Let's try again!",
      "Looks like we hit a snag in the show ring. No worries!"
    ];
    const seed = (error?.message?.length || message?.length || 0) % messages.length;
    return messages[seed];
  }, [error?.message, message]);

  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          {/* Sad but cute dog animation */}
          <div className="relative mb-8">
            <div className="text-8xl animate-bounce">🐕</div>
            <div className="absolute -top-2 -right-2 text-2xl animate-pulse">💔</div>
            <div className="absolute -bottom-2 -left-2 text-xl animate-bounce" style={{ animationDelay: '0.5s' }}>💧</div>
          </div>
          
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {message || randomMessage}
          </h1>
          
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Don't worry, even champion dogs stumble sometimes! Let's get back on track and continue showing off your amazing pups.
          </p>
          
          {showDetails && error && (
            <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-muted-foreground font-mono">
                {error.message}
              </p>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleRefresh} className="group">
              <RefreshCw className="w-4 h-4 mr-2 group-hover:animate-spin" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <a href="/" className="flex items-center">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </a>
            </Button>
          </div>
          
          {/* Encouraging footer */}
          <div className="mt-8 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border border-primary/10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Heart className="w-4 h-4 text-red-500 animate-pulse" />
              <span>We're always working to make myK9Show better for you and your dogs!</span>
              <span className="text-lg animate-bounce">🐾</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
        <span className="text-destructive">{message || "Something went wrong"}</span>
        {reset && (
          <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  // Default component variant
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card border border-border rounded-lg">
      {/* Cute error animation */}
      <div className="relative mb-6">
        <div className="text-4xl animate-bounce">🐕‍🦺</div>
        <div className="absolute -top-1 -right-1 text-lg animate-pulse">⚠️</div>
      </div>
      
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {message || randomMessage}
      </h3>
      
      <p className="text-muted-foreground mb-6 max-w-sm">
        Our rescue dog is on the case! While we fetch a solution, you can try refreshing or go back home.
      </p>
      
      {showDetails && error && (
        <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4 text-left text-xs font-mono text-muted-foreground max-w-full overflow-x-auto">
          {error.message}
        </div>
      )}
      
      <div className="flex gap-3">
        {reset && (
          <Button size="sm" onClick={reset} className="group">
            <RefreshCw className="w-4 h-4 mr-2 group-hover:animate-spin" />
            Try Again
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <a href="/">
            <Home className="w-4 h-4 mr-2" />
            Home
          </a>
        </Button>
      </div>
      
      {/* Paw print decoration */}
      <div className="flex gap-2 mt-6 opacity-40">
        <span className="text-xs animate-pulse">🐾</span>
        <span className="text-xs animate-pulse" style={{ animationDelay: '0.5s' }}>🐾</span>
        <span className="text-xs animate-pulse" style={{ animationDelay: '1s' }}>🐾</span>
      </div>
    </div>
  );
};

export default DelightfulError;