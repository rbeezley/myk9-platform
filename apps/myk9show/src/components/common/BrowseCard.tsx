import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';

interface BrowseCardProps {
  href: string;
  actionLabel: string;
  badges?: React.ReactNode;
  avatar: React.ReactNode;
  name: string;
  children?: React.ReactNode;
}

export function BrowseCard({ href, actionLabel, badges, avatar, name, children }: BrowseCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="group cursor-pointer rounded-xl bg-card shadow-card transition-all hover:shadow-card-hover"
      onClick={() => navigate(href)}
      role="link"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(href)}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Cover / avatar */}
        <div className="shrink-0">{avatar}</div>

        {/* Facts */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-card-foreground truncate">{name}</h3>
            {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
          </div>
          {children && <div className="mt-1.5">{children}</div>}
        </div>

        {/* Action */}
        <div className="shrink-0 ml-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs transition-colors group-hover:border-primary/40 group-hover:text-primary"
            onClick={e => {
              e.stopPropagation();
              navigate(href);
            }}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BrowseCardAvatarProps {
  src?: string | null | undefined;
  fallback: string;
  alt: string;
  shape?: 'circle' | 'square';
}

export function BrowseCardAvatar({ src, fallback, alt, shape = 'circle' }: BrowseCardAvatarProps) {
  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`h-12 w-12 shrink-0 object-cover ring-2 ring-border ${rounded}`}
      />
    );
  }

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10 text-sm font-semibold text-primary ring-2 ring-border ${rounded}`}
    >
      {fallback}
    </div>
  );
}

export function BrowseCardDetail({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}
