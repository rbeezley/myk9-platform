import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { RemediationTarget } from './remediationTarget';

export function RemediationLink({
  target,
  children,
  className,
}: {
  target: RemediationTarget;
  children: ReactNode;
  className?: string;
}) {
  return target.kind === 'external' ? (
    <a href={target.href} target="_blank" rel="noreferrer" className={className}>
      {children} <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <Link to={target.href} className={className}>
      {children}
    </Link>
  );
}
