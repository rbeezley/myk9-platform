import type { SVGProps } from 'react';

/** AskQ's compact shell mark: a Q contained by a conversation bubble. */
export function AskQIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={className}
      data-icon="askq"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <circle cx="12" cy="10.5" r="3.25" />
      <path d="m14.25 12.75 1.5 1.5" />
    </svg>
  );
}
